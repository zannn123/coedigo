<?php
/**
 * C.O.E.D.I.G.O. - Authentication Controller
 * Handles login, token refresh, and password management
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../utils/Response.php';
require_once __DIR__ . '/../utils/Validator.php';

class AuthController {

    private $db;

    public function __construct() {
        $database = new Database();
        $this->db = $database->getConnection();
    }

    /**
     * POST /api/auth/login
     */
    public function login() {
        $data = json_decode(file_get_contents('php://input'), true);

        $validator = new Validator();
        $validator->required('email', $data['email'] ?? '')
                  ->required('password', $data['password'] ?? '')
                  ->email('email', $data['email'] ?? '');

        if (!$validator->isValid()) {
            Response::error('Validation failed.', 422, $validator->getErrors());
        }

        $stmt = $this->db->prepare("SELECT * FROM users WHERE email = ? AND is_active = 1");
        $stmt->execute([$data['email']]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($data['password'], $user['password_hash'])) {
            // Log failed attempt
            $this->logAudit(null, 'LOGIN_FAILED', 'user', null, null, ['email' => $data['email']]);
            Response::error('Invalid email or password.', 401);
        }

        // Update last login
        $update = $this->db->prepare("UPDATE users SET last_login = NOW() WHERE id = ?");
        $update->execute([$user['id']]);

        // Generate token
        $token = AuthMiddleware::generateToken($user['id'], $user['role'], $user['email']);

        // Log success
        $this->logAudit($user['id'], 'LOGIN_SUCCESS', 'user', $user['id']);

        Response::success([
            'token' => $token,
            'user' => [
                'id' => (int)$user['id'],
                'employee_id' => $user['employee_id'],
                'student_id' => $user['student_id'],
                'first_name' => $user['first_name'],
                'middle_name' => $user['middle_name'],
                'last_name' => $user['last_name'],
                'email' => $user['email'],
                'role' => $user['role'],
                'department' => $user['department'],
                'program' => $user['program'],
                'profile_image' => $user['profile_image']
            ]
        ], 'Login successful.');
    }

    /**
     * GET /api/auth/me
     */
    public function me() {
        $auth = AuthMiddleware::authenticate();

        $stmt = $this->db->prepare("SELECT id, employee_id, student_id, first_name, middle_name, last_name, suffix, email, role, department, program, year_level, contact_number, profile_image, last_login, created_at FROM users WHERE id = ?");
        $stmt->execute([$auth['sub']]);
        $user = $stmt->fetch();

        if (!$user) {
            Response::error('User not found.', 404);
        }

        Response::success($user, 'User profile retrieved.');
    }

    /**
     * PUT /api/auth/password
     */
    public function changePassword() {
        $auth = AuthMiddleware::authenticate();
        $data = json_decode(file_get_contents('php://input'), true);

        $validator = new Validator();
        $validator->required('current_password', $data['current_password'] ?? '')
                  ->required('new_password', $data['new_password'] ?? '')
                  ->minLength('new_password', $data['new_password'] ?? '', 8, 'New password');

        if (!$validator->isValid()) {
            Response::error('Validation failed.', 422, $validator->getErrors());
        }

        $stmt = $this->db->prepare("SELECT password_hash FROM users WHERE id = ?");
        $stmt->execute([$auth['sub']]);
        $user = $stmt->fetch();

        if (!password_verify($data['current_password'], $user['password_hash'])) {
            Response::error('Current password is incorrect.', 400);
        }

        $newHash = password_hash($data['new_password'], PASSWORD_DEFAULT);
        $update = $this->db->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
        $update->execute([$newHash, $auth['sub']]);

        $this->logAudit($auth['sub'], 'PASSWORD_CHANGED', 'user', $auth['sub']);

        Response::success(null, 'Password changed successfully.');
    }

    private function logAudit($userId, $action, $entityType = null, $entityId = null, $oldValues = null, $newValues = null) {
        try {
            $stmt = $this->db->prepare("INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $userId,
                $action,
                $entityType,
                $entityId,
                $oldValues ? json_encode($oldValues) : null,
                $newValues ? json_encode($newValues) : null,
                $_SERVER['REMOTE_ADDR'] ?? null,
                $_SERVER['HTTP_USER_AGENT'] ?? null
            ]);
        } catch (Exception $e) {
            // Silently fail - audit logging should not break functionality
        }
    }
}
