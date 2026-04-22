<?php
/**
 * C.O.E.D.I.G.O. - User Management Controller
 * Admin-only user CRUD operations
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../utils/Response.php';
require_once __DIR__ . '/../utils/Validator.php';

class UserController {

    private $db;

    public function __construct() {
        $database = new Database();
        $this->db = $database->getConnection();
    }

    /**
     * GET /api/users
     * List users with filters and pagination
     */
    public function index() {
        $auth = AuthMiddleware::authorize(['admin', 'faculty', 'dean', 'program_chair']);

        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = min(100, max(1, (int)($_GET['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;
        $role = $_GET['role'] ?? null;
        $search = $_GET['search'] ?? null;
        $department = $_GET['department'] ?? null;
        $program = $_GET['program'] ?? null;
        $active = $_GET['is_active'] ?? null;

        $where = [];
        $params = [];

        if ($role) {
            $where[] = "role = ?";
            $params[] = $role;
        }

        // Faculty can only list students
        if ($auth['role'] === 'faculty') {
            $where[] = "role = 'student'";
        }

        if ($search) {
            $where[] = "(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR student_id LIKE ? OR employee_id LIKE ?)";
            $searchTerm = "%$search%";
            $params = array_merge($params, [$searchTerm, $searchTerm, $searchTerm, $searchTerm, $searchTerm]);
        }

        if ($department) {
            $where[] = "department = ?";
            $params[] = $department;
        }

        if ($program) {
            $where[] = "program = ?";
            $params[] = $program;
        }

        if ($active !== null) {
            $where[] = "is_active = ?";
            $params[] = (int)$active;
        }

        $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        // Count total
        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM users $whereClause");
        $countStmt->execute($params);
        $total = $countStmt->fetchColumn();

        // Fetch users
        $stmt = $this->db->prepare("SELECT id, employee_id, student_id, first_name, middle_name, last_name, suffix, email, role, department, program, year_level, contact_number, is_active, last_login, created_at FROM users $whereClause ORDER BY last_name, first_name LIMIT $limit OFFSET $offset");
        $stmt->execute($params);
        $users = $stmt->fetchAll();

        Response::paginated($users, $total, $page, $limit);
    }

    /**
     * GET /api/users/:id
     */
    public function show($id) {
        $auth = AuthMiddleware::authorize(['admin', 'faculty', 'dean', 'program_chair']);

        $stmt = $this->db->prepare("SELECT id, employee_id, student_id, first_name, middle_name, last_name, suffix, email, role, department, program, year_level, contact_number, profile_image, is_active, last_login, created_at FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $user = $stmt->fetch();

        if (!$user) {
            Response::error('User not found.', 404);
        }

        Response::success($user);
    }

    /**
     * POST /api/users
     * Admin creates a new user
     */
    public function create() {
        $auth = AuthMiddleware::authorize(['admin']);
        $data = json_decode(file_get_contents('php://input'), true);

        $validator = new Validator();
        $validator->required('first_name', $data['first_name'] ?? '', 'First name')
                  ->required('last_name', $data['last_name'] ?? '', 'Last name')
                  ->required('email', $data['email'] ?? '')
                  ->email('email', $data['email'] ?? '')
                  ->required('password', $data['password'] ?? '')
                  ->minLength('password', $data['password'] ?? '', 8, 'Password')
                  ->required('role', $data['role'] ?? '')
                  ->inArray('role', $data['role'] ?? '', ['admin', 'faculty', 'student', 'dean', 'program_chair']);

        if (!$validator->isValid()) {
            Response::error('Validation failed.', 422, $validator->getErrors());
        }

        // Check email uniqueness
        $check = $this->db->prepare("SELECT id FROM users WHERE email = ?");
        $check->execute([$data['email']]);
        if ($check->fetch()) {
            Response::error('Email already exists.', 409);
        }

        // Check ID uniqueness
        if (!empty($data['student_id'])) {
            $check = $this->db->prepare("SELECT id FROM users WHERE student_id = ?");
            $check->execute([$data['student_id']]);
            if ($check->fetch()) {
                Response::error('Student ID already exists.', 409);
            }
        }
        if (!empty($data['employee_id'])) {
            $check = $this->db->prepare("SELECT id FROM users WHERE employee_id = ?");
            $check->execute([$data['employee_id']]);
            if ($check->fetch()) {
                Response::error('Employee ID already exists.', 409);
            }
        }

        $passwordHash = password_hash($data['password'], PASSWORD_DEFAULT);

        $stmt = $this->db->prepare("INSERT INTO users (employee_id, student_id, first_name, middle_name, last_name, suffix, email, password_hash, role, department, program, year_level, contact_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

        $stmt->execute([
            $data['employee_id'] ?? null,
            $data['student_id'] ?? null,
            $data['first_name'],
            $data['middle_name'] ?? null,
            $data['last_name'],
            $data['suffix'] ?? null,
            $data['email'],
            $passwordHash,
            $data['role'],
            $data['department'] ?? null,
            $data['program'] ?? null,
            $data['year_level'] ?? null,
            $data['contact_number'] ?? null
        ]);

        $newId = $this->db->lastInsertId();
        $this->logAudit($auth['sub'], 'CREATE_USER', 'user', $newId, null, ['email' => $data['email'], 'role' => $data['role']]);

        Response::success(['id' => (int)$newId], 'User created successfully.', 201);
    }

    /**
     * PUT /api/users/:id
     */
    public function update($id) {
        $auth = AuthMiddleware::authorize(['admin']);
        $data = json_decode(file_get_contents('php://input'), true);

        // Fetch existing
        $stmt = $this->db->prepare("SELECT * FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            Response::error('User not found.', 404);
        }

        $fields = [];
        $params = [];

        $updatable = ['employee_id', 'student_id', 'first_name', 'middle_name', 'last_name', 'suffix', 'email', 'role', 'department', 'program', 'year_level', 'contact_number', 'is_active'];

        foreach ($updatable as $field) {
            if (array_key_exists($field, $data)) {
                $fields[] = "$field = ?";
                $params[] = $data[$field];
            }
        }

        // Handle password reset
        if (!empty($data['password'])) {
            $fields[] = "password_hash = ?";
            $params[] = password_hash($data['password'], PASSWORD_DEFAULT);
        }

        if (empty($fields)) {
            Response::error('No fields to update.', 400);
        }

        // Email uniqueness check
        if (!empty($data['email']) && $data['email'] !== $existing['email']) {
            $check = $this->db->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
            $check->execute([$data['email'], $id]);
            if ($check->fetch()) {
                Response::error('Email already in use.', 409);
            }
        }

        $params[] = $id;
        $sql = "UPDATE users SET " . implode(', ', $fields) . " WHERE id = ?";
        $this->db->prepare($sql)->execute($params);

        $this->logAudit($auth['sub'], 'UPDATE_USER', 'user', $id, null, $data);

        Response::success(null, 'User updated successfully.');
    }

    /**
     * DELETE /api/users/:id (soft delete)
     */
    public function delete($id) {
        $auth = AuthMiddleware::authorize(['admin']);

        // Prevent self-deletion
        if ((int)$id === (int)$auth['sub']) {
            Response::error('You cannot deactivate your own account.', 400);
        }

        $stmt = $this->db->prepare("UPDATE users SET is_active = 0 WHERE id = ?");
        $stmt->execute([$id]);

        if ($stmt->rowCount() === 0) {
            Response::error('User not found.', 404);
        }

        $this->logAudit($auth['sub'], 'DEACTIVATE_USER', 'user', $id);

        Response::success(null, 'User deactivated successfully.');
    }

    /**
     * GET /api/users/stats
     */
    public function stats() {
        AuthMiddleware::authorize(['admin']);

        $stmt = $this->db->query("SELECT role, COUNT(*) as count FROM users WHERE is_active = 1 GROUP BY role");
        $roleStats = $stmt->fetchAll();

        $stmt = $this->db->query("SELECT COUNT(*) as total FROM users WHERE is_active = 1");
        $total = $stmt->fetch()['total'];

        $stmt = $this->db->query("SELECT program, COUNT(*) as count FROM users WHERE role = 'student' AND is_active = 1 AND program IS NOT NULL GROUP BY program ORDER BY count DESC");
        $programStats = $stmt->fetchAll();

        Response::success([
            'total_active' => (int)$total,
            'by_role' => $roleStats,
            'students_by_program' => $programStats
        ]);
    }

    private function logAudit($userId, $action, $entityType = null, $entityId = null, $oldValues = null, $newValues = null) {
        try {
            $stmt = $this->db->prepare("INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$userId, $action, $entityType, $entityId, $oldValues ? json_encode($oldValues) : null, $newValues ? json_encode($newValues) : null, $_SERVER['REMOTE_ADDR'] ?? null, $_SERVER['HTTP_USER_AGENT'] ?? null]);
        } catch (Exception $e) {}
    }
}
