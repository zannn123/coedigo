<?php
/**
 * C.O.E.D.I.G.O. - User Management Controller
 * Admin-only user CRUD operations
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../utils/Response.php';
require_once __DIR__ . '/../utils/Validator.php';
require_once __DIR__ . '/../utils/Mailer.php';
require_once __DIR__ . '/../utils/Logger.php';

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
        if (!is_array($data)) {
            Logger::error('user.create.invalid_payload', [
                'admin_id' => $auth['sub'],
                'body' => file_get_contents('php://input'),
            ]);
            Response::error('Invalid request payload.', 400);
        }

        $data = $this->normalizeUserPayload($data);
        $passwordInput = trim((string)($data['password'] ?? ''));
        $passwordWasGenerated = $passwordInput === '';
        $plainPassword = $passwordWasGenerated ? $this->generateRandomPassword() : (string)$data['password'];

        $validator = new Validator();
        $validator->required('first_name', $data['first_name'] ?? '', 'First name')
                  ->required('last_name', $data['last_name'] ?? '', 'Last name')
                  ->required('email', $data['email'] ?? '')
                  ->email('email', $data['email'] ?? '')
                  ->minLength('password', $plainPassword, 8, 'Password')
                  ->required('role', $data['role'] ?? '')
                  ->inArray('role', $data['role'] ?? '', ['admin', 'faculty', 'student', 'dean', 'program_chair']);

        if (!$validator->isValid()) {
            Logger::error('user.create.validation_failed', [
                'admin_id' => $auth['sub'],
                'email' => $data['email'] ?? null,
                'role' => $data['role'] ?? null,
                'errors' => $validator->getErrors(),
            ]);
            Response::error('Validation failed.', 422, $validator->getErrors());
        }

        try {
            $this->db->beginTransaction();

            // Check email uniqueness
            $check = $this->db->prepare("SELECT id FROM users WHERE email = ?");
            $check->execute([$data['email']]);
            if ($check->fetch()) {
                $this->db->rollBack();
                Logger::error('user.create.duplicate_email', [
                    'admin_id' => $auth['sub'],
                    'email' => $data['email'],
                ]);
                Response::error('Email already exists.', 409);
            }

            // Check ID uniqueness
            if (!empty($data['student_id'])) {
                $check = $this->db->prepare("SELECT id FROM users WHERE student_id = ?");
                $check->execute([$data['student_id']]);
                if ($check->fetch()) {
                    $this->db->rollBack();
                    Logger::error('user.create.duplicate_student_id', [
                        'admin_id' => $auth['sub'],
                        'student_id' => $data['student_id'],
                        'email' => $data['email'],
                    ]);
                    Response::error('Student ID already exists.', 409);
                }
            }
            if (!empty($data['employee_id'])) {
                $check = $this->db->prepare("SELECT id FROM users WHERE employee_id = ?");
                $check->execute([$data['employee_id']]);
                if ($check->fetch()) {
                    $this->db->rollBack();
                    Logger::error('user.create.duplicate_employee_id', [
                        'admin_id' => $auth['sub'],
                        'employee_id' => $data['employee_id'],
                        'email' => $data['email'],
                    ]);
                    Response::error('Employee ID already exists.', 409);
                }
            }

            $passwordHash = password_hash($plainPassword, PASSWORD_DEFAULT);

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

            $newId = (int)$this->db->lastInsertId();
            if ($newId <= 0) {
                throw new RuntimeException('User insert did not return a valid ID.');
            }

            $verify = $this->db->prepare("SELECT id, email, role, is_active FROM users WHERE id = ?");
            $verify->execute([$newId]);
            $createdUser = $verify->fetch();

            if (!$createdUser) {
                throw new RuntimeException('User insert verification failed.');
            }

            $this->db->commit();
        } catch (PDOException $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }

            $duplicateMessage = $this->mapConstraintError($e->getMessage());
            Logger::error('user.create.failed', [
                'admin_id' => $auth['sub'],
                'email' => $data['email'] ?? null,
                'role' => $data['role'] ?? null,
                'student_id' => $data['student_id'] ?? null,
                'employee_id' => $data['employee_id'] ?? null,
                'message' => $e->getMessage(),
            ]);

            if ($duplicateMessage) {
                Response::error($duplicateMessage, 409);
            }

            Response::error('Failed to create user account. Check backend logs for details.', 500);
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }

            Logger::error('user.create.failed', [
                'admin_id' => $auth['sub'],
                'email' => $data['email'] ?? null,
                'role' => $data['role'] ?? null,
                'student_id' => $data['student_id'] ?? null,
                'employee_id' => $data['employee_id'] ?? null,
                'message' => $e->getMessage(),
            ]);

            Response::error('Failed to create user account. Check backend logs for details.', 500);
        }

        Logger::info('user.create.success', [
            'admin_id' => $auth['sub'],
            'created_user_id' => $newId,
            'email' => $data['email'],
            'role' => $data['role'],
            'password_generated' => $passwordWasGenerated,
        ]);

        $this->logAudit($auth['sub'], 'CREATE_USER', 'user', $newId, null, ['email' => $data['email'], 'role' => $data['role']]);

        $mailer = new Mailer($this->db);
        $recipientName = trim(($data['first_name'] ?? '') . ' ' . ($data['last_name'] ?? ''));
        $mailResult = $mailer->sendWelcomeCredentialsEmail($data['email'], $recipientName, $plainPassword, $data['role']);

        $responseData = [
            'id' => (int)$newId,
            'email_sent' => $mailResult['success'],
            'password_generated' => $passwordWasGenerated,
        ];

        if ($passwordWasGenerated) {
            $responseData['temporary_password'] = $plainPassword;
        }

        $message = 'User created successfully. Welcome email sent.';

        if (!$mailResult['success']) {
            $message = 'User created, but the welcome email could not be sent.';
            $responseData['email_error'] = $mailResult['message'];
            Logger::error('user.create.email_failed', [
                'admin_id' => $auth['sub'],
                'created_user_id' => $newId,
                'email' => $data['email'],
                'role' => $data['role'],
                'password_generated' => $passwordWasGenerated,
                'message' => $mailResult['message'],
            ]);

        } else {
            Logger::info('user.create.email_sent', [
                'admin_id' => $auth['sub'],
                'created_user_id' => $newId,
                'email' => $data['email'],
                'role' => $data['role'],
            ]);
        }

        Response::success($responseData, $message, 201);
    }

    /**
     * PUT /api/users/:id/status
     * Toggle account active status without deleting the record.
     */
    public function updateStatus($id) {
        $data = json_decode(file_get_contents('php://input'), true);

        if (!is_array($data) || !array_key_exists('is_active', $data)) {
            Response::error('Account status is required.', 422);
        }

        $this->setUserActiveStatus($id, (int)$data['is_active']);
    }

    /**
     * PUT /api/users/:id
     */
    public function update($id) {
        $auth = AuthMiddleware::authorize(['admin']);
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            Response::error('Invalid request payload.', 400);
        }

        $data = $this->normalizeUserPayload($data, true);

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

        if (array_key_exists('student_id', $data) && $data['student_id'] !== null && $data['student_id'] !== $existing['student_id']) {
            $check = $this->db->prepare("SELECT id FROM users WHERE student_id = ? AND id != ?");
            $check->execute([$data['student_id'], $id]);
            if ($check->fetch()) {
                Response::error('Student ID already exists.', 409);
            }
        }

        if (array_key_exists('employee_id', $data) && $data['employee_id'] !== null && $data['employee_id'] !== $existing['employee_id']) {
            $check = $this->db->prepare("SELECT id FROM users WHERE employee_id = ? AND id != ?");
            $check->execute([$data['employee_id'], $id]);
            if ($check->fetch()) {
                Response::error('Employee ID already exists.', 409);
            }
        }

        $params[] = $id;
        $sql = "UPDATE users SET " . implode(', ', $fields) . " WHERE id = ?";
        try {
            $this->db->prepare($sql)->execute($params);
        } catch (PDOException $e) {
            Logger::error('user.update.failed', [
                'admin_id' => $auth['sub'],
                'target_user_id' => (int)$id,
                'message' => $e->getMessage(),
                'payload' => $data,
            ]);

            $duplicateMessage = $this->mapConstraintError($e->getMessage());
            if ($duplicateMessage) {
                Response::error($duplicateMessage, 409);
            }

            Response::error('Failed to update user account. Check backend logs for details.', 500);
        }

        $this->logAudit($auth['sub'], 'UPDATE_USER', 'user', $id, null, $data);

        Response::success(null, 'User updated successfully.');
    }

    /**
     * DELETE /api/users/:id (soft delete)
     */
    public function delete($id) {
        $this->setUserActiveStatus($id, 0);
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

    private function setUserActiveStatus($id, $isActive) {
        $auth = AuthMiddleware::authorize(['admin']);
        $targetStatus = (int)$isActive === 1 ? 1 : 0;

        if ((int)$id === (int)$auth['sub'] && $targetStatus === 0) {
            Response::error('You cannot deactivate your own account.', 400);
        }

        $stmt = $this->db->prepare("SELECT id, is_active FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $existing = $stmt->fetch();

        if (!$existing) {
            Response::error('User not found.', 404);
        }

        if ((int)$existing['is_active'] === $targetStatus) {
            Response::success([
                'id' => (int)$id,
                'is_active' => $targetStatus,
            ], $targetStatus === 1 ? 'User is already active.' : 'User is already inactive.');
        }

        $update = $this->db->prepare("UPDATE users SET is_active = ? WHERE id = ?");
        $update->execute([$targetStatus, $id]);

        $action = $targetStatus === 1 ? 'REACTIVATE_USER' : 'DEACTIVATE_USER';
        $this->logAudit($auth['sub'], $action, 'user', $id, ['is_active' => (int)$existing['is_active']], ['is_active' => $targetStatus]);

        Response::success([
            'id' => (int)$id,
            'is_active' => $targetStatus,
        ], $targetStatus === 1 ? 'User reactivated successfully.' : 'User deactivated successfully.');
    }

    private function generateRandomPassword($length = 12) {
        // Keep temporary passwords strong but easy to transcribe from email or an admin handoff.
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
        $password = '';
        $maxIndex = strlen($alphabet) - 1;

        for ($i = 0; $i < $length; $i++) {
            $password .= $alphabet[random_int(0, $maxIndex)];
        }

        return $password;
    }

    private function normalizeUserPayload(array $data, $partial = false) {
        $trimFields = [
            'first_name',
            'middle_name',
            'last_name',
            'suffix',
            'email',
            'role',
            'department',
            'program',
            'student_id',
            'employee_id',
            'contact_number',
            'password',
        ];

        foreach ($trimFields as $field) {
            if (array_key_exists($field, $data) && is_string($data[$field])) {
                $data[$field] = trim($data[$field]);
            }
        }

        if (array_key_exists('email', $data) && $data['email'] !== '') {
            $data['email'] = strtolower($data['email']);
        }

        foreach (['middle_name', 'suffix', 'department', 'program', 'student_id', 'employee_id', 'contact_number', 'password'] as $field) {
            if (array_key_exists($field, $data) && $data[$field] === '') {
                $data[$field] = null;
            }
        }

        if (array_key_exists('year_level', $data)) {
            if ($data['year_level'] === '' || $data['year_level'] === null) {
                $data['year_level'] = null;
            } else {
                $data['year_level'] = (int)$data['year_level'];
            }
        } elseif (!$partial) {
            $data['year_level'] = null;
        }

        if (($data['role'] ?? null) === 'student') {
            $data['employee_id'] = null;
        } elseif (array_key_exists('role', $data)) {
            $data['student_id'] = $data['student_id'] ?? null;
            $data['year_level'] = array_key_exists('year_level', $data) ? $data['year_level'] : null;
        }

        return $data;
    }

    private function mapConstraintError($message) {
        if (stripos($message, "for key 'email'") !== false) {
            return 'Email already exists.';
        }

        if (stripos($message, "for key 'student_id'") !== false) {
            return 'Student ID already exists.';
        }

        if (stripos($message, "for key 'employee_id'") !== false) {
            return 'Employee ID already exists.';
        }

        return null;
    }
}
