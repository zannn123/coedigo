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
        $this->ensureAccountUpdateRequestTable();
    }

    /**
     * POST /api/auth/login
     */
    public function login() {
        $data = json_decode(file_get_contents('php://input'), true);
        $email = strtolower(trim((string)($data['email'] ?? '')));
        $password = (string)($data['password'] ?? '');

        $validator = new Validator();
        $validator->required('email', $email)
                  ->required('password', $password)
                  ->email('email', $email);

        if (!$validator->isValid()) {
            Response::error('Validation failed.', 422, $validator->getErrors());
        }

        $stmt = $this->db->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if ($user && (int)$user['is_active'] !== 1) {
            $this->logAudit($user['id'], 'LOGIN_DISABLED_ACCOUNT', 'user', $user['id'], null, ['email' => $email]);
            Response::error('Account disabled. Please contact your program chair or the College of Engineering faculty office.', 403);
        }

        if (!$user || !password_verify($password, $user['password_hash'])) {
            // Log failed attempt
            $this->logAudit(null, 'LOGIN_FAILED', 'user', null, null, ['email' => $email]);
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

    /**
     * POST /api/auth/credential-request
     */
    public function requestCredentialUpdate() {
        $auth = AuthMiddleware::authenticate();
        $data = json_decode(file_get_contents('php://input'), true);

        if (!is_array($data)) {
            Response::error('Invalid request payload.', 400);
        }

        $requestType = trim((string)($data['request_type'] ?? 'profile_update'));
        $requestedEmail = trim((string)($data['requested_email'] ?? ''));
        $requestedContact = trim((string)($data['requested_contact_number'] ?? ''));
        $note = trim((string)($data['note'] ?? ''));

        $validator = new Validator();
        $validator->required('note', $note)
                  ->minLength('note', $note, 10, 'Note');

        if ($requestedEmail !== '') {
            $validator->email('requested_email', $requestedEmail, 'Requested email');
        }

        if (!$validator->isValid()) {
            Response::error('Validation failed.', 422, $validator->getErrors());
        }

        $userStmt = $this->db->prepare("
            SELECT id, first_name, middle_name, last_name, suffix, email, role, student_id, employee_id, contact_number
            FROM users
            WHERE id = ?
        ");
        $userStmt->execute([$auth['sub']]);
        $user = $userStmt->fetch();

        if (!$user) {
            Response::error('User not found.', 404);
        }

        $adminStmt = $this->db->query("SELECT id FROM users WHERE role = 'admin' AND is_active = 1");
        $adminIds = array_map('intval', array_column($adminStmt->fetchAll(), 'id'));

        if (!$adminIds) {
            Response::error('No active administrator is available to receive this request.', 503);
        }

        $fullName = trim(implode(' ', array_filter([
            $user['first_name'] ?? '',
            $user['middle_name'] ?? '',
            $user['last_name'] ?? '',
            $user['suffix'] ?? '',
        ])));

        $summary = $this->buildCredentialRequestSummary($user, $requestType, $requestedEmail, $requestedContact, $note);

        $this->db->beginTransaction();
        try {
            $requestInsert = $this->db->prepare("
                INSERT INTO account_update_requests (
                    requester_user_id,
                    request_type,
                    current_email,
                    current_contact_number,
                    requested_email,
                    requested_contact_number,
                    note
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $requestInsert->execute([
                (int)$user['id'],
                $requestType,
                $user['email'] ?: null,
                $user['contact_number'] ?: null,
                $requestedEmail !== '' ? $requestedEmail : null,
                $requestedContact !== '' ? $requestedContact : null,
                $note,
            ]);

            $requestId = (int)$this->db->lastInsertId();

            $insert = $this->db->prepare("
                INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id)
                VALUES (?, ?, ?, 'system', 'account_update_request', ?)
            ");

            foreach ($adminIds as $adminId) {
                $insert->execute([
                    $adminId,
                    'Account update request',
                    $summary,
                    $requestId,
                ]);
            }

            $this->db->commit();
        } catch (Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            Response::error('Unable to create the request right now.', 500);
        }

        $this->logAudit(
            $auth['sub'],
            'CREDENTIAL_UPDATE_REQUESTED',
            'user',
            $auth['sub'],
            null,
            [
                'request_type' => $requestType,
                'requested_email' => $requestedEmail ?: null,
                'requested_contact_number' => $requestedContact ?: null,
                'note' => $note,
                'sent_to_admin_ids' => $adminIds,
            ]
        );

        Response::success(null, 'Your request has been sent to the admin.');
    }

    private function formatCredentialRequestType($requestType) {
        $labels = [
            'profile_update' => 'Profile update',
            'email_change' => 'Email change',
            'contact_change' => 'Contact number change',
            'student_record' => 'Student record correction',
            'employee_record' => 'Employee record correction',
            'other' => 'Other',
        ];

        return $labels[$requestType] ?? ucwords(str_replace('_', ' ', $requestType));
    }

    private function buildCredentialRequestSummary(array $user, $requestType, $requestedEmail, $requestedContact, $note) {
        $changeLines = [];
        $changeLines[] = 'Requester: ' . trim(implode(' ', array_filter([
            $user['first_name'] ?? '',
            $user['middle_name'] ?? '',
            $user['last_name'] ?? '',
            $user['suffix'] ?? '',
        ])));
        $changeLines[] = 'Request type: ' . $this->formatCredentialRequestType($requestType);
        $changeLines[] = 'Current email: ' . ($user['email'] ?: 'N/A');
        if ($requestedEmail !== '') {
            $changeLines[] = 'Requested email: ' . $requestedEmail;
        }
        if ($requestedContact !== '') {
            $changeLines[] = 'Requested contact number: ' . $requestedContact;
        }
        if (!empty($user['student_id'])) {
            $changeLines[] = 'Student ID: ' . $user['student_id'];
        }
        if (!empty($user['employee_id'])) {
            $changeLines[] = 'Employee ID: ' . $user['employee_id'];
        }
        $changeLines[] = 'Note: ' . $note;

        return implode("\n", $changeLines);
    }

    private function ensureAccountUpdateRequestTable() {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS account_update_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                requester_user_id INT NOT NULL,
                request_type VARCHAR(50) NOT NULL,
                current_email VARCHAR(255) DEFAULT NULL,
                current_contact_number VARCHAR(20) DEFAULT NULL,
                requested_email VARCHAR(255) DEFAULT NULL,
                requested_contact_number VARCHAR(20) DEFAULT NULL,
                note TEXT NOT NULL,
                status ENUM('pending', 'done', 'cancelled') NOT NULL DEFAULT 'pending',
                admin_note TEXT DEFAULT NULL,
                resolved_by INT DEFAULT NULL,
                resolved_at DATETIME DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
                INDEX idx_requester_status (requester_user_id, status),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB
        ");
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
