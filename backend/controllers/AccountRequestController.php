<?php
/**
 * C.O.E.D.I.G.O. - Account Request Controller
 * Public endpoint for requesting an account + admin management.
 * ID photos are stored temporarily and deleted once the admin creates the account.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../utils/Response.php';
require_once __DIR__ . '/../utils/Validator.php';
require_once __DIR__ . '/../utils/Mailer.php';
require_once __DIR__ . '/../utils/Logger.php';

class AccountRequestController {

    private $db;
    private $uploadDir;

    public function __construct() {
        $database = new Database();
        $this->db = $database->getConnection();
        $this->uploadDir = __DIR__ . '/../assets/id-photos';
        if (!is_dir($this->uploadDir)) {
            mkdir($this->uploadDir, 0755, true);
        }
        $this->ensureTable();
    }

    /**
     * POST /api/account-requests  (PUBLIC — no auth required)
     * Accepts multipart/form-data with an id_photo file.
     */
    public function store() {
        // Capture any stray PHP warnings so they don't corrupt the JSON output
        ob_start();

        $data = $_POST;

        $validator = new Validator();
        $validator->required('first_name', $data['first_name'] ?? '', 'First name')
                  ->required('last_name',  $data['last_name']  ?? '', 'Last name')
                  ->required('email',      $data['email']      ?? '', 'Email')
                  ->email('email',         $data['email']      ?? '')
                  ->required('role',       $data['role']       ?? '', 'Role')
                  ->inArray('role',        $data['role']       ?? '', ['student', 'faculty', 'dean', 'program_chair']);

        if (!$validator->isValid()) {
            Response::error('Validation failed.', 422, $validator->getErrors());
        }

        // Check duplicate email
        $check = $this->db->prepare("SELECT id FROM users WHERE email = ?");
        $check->execute([strtolower(trim($data['email']))]);
        if ($check->fetch()) {
            Response::error('An account with this email already exists.', 409);
        }

        // Check duplicate pending request
        $check2 = $this->db->prepare("SELECT id FROM account_requests WHERE email = ? AND status = 'pending'");
        $check2->execute([strtolower(trim($data['email']))]);
        if ($check2->fetch()) {
            Response::error('A pending request for this email already exists. Please wait for the admin to review it.', 409);
        }

        // Handle ID photo
        $idPhotoPath = null;
        if (!empty($_FILES['id_photo']) && $_FILES['id_photo']['error'] === UPLOAD_ERR_OK) {
            $allowed = ['image/jpeg', 'image/png', 'image/webp'];
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = finfo_file($finfo, $_FILES['id_photo']['tmp_name']);
            finfo_close($finfo);

            if (!in_array($mime, $allowed)) {
                Response::error('ID photo must be a JPEG, PNG, or WebP image.', 422);
            }

            if ($_FILES['id_photo']['size'] > 5 * 1024 * 1024) {
                Response::error('ID photo must be under 5 MB.', 422);
            }

            $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$mime];
            $filename = 'id_' . bin2hex(random_bytes(12)) . '.' . $ext;
            $dest = $this->uploadDir . '/' . $filename;
            move_uploaded_file($_FILES['id_photo']['tmp_name'], $dest);
            $idPhotoPath = $filename;
        } else {
            Response::error('Please upload a photo of your school or government ID.', 422);
        }

        $email = strtolower(trim($data['email']));

        $stmt = $this->db->prepare("
            INSERT INTO account_requests (
                first_name, middle_name, last_name, suffix, email, role,
                department, program, year_level,
                student_id, employee_id, contact_number,
                id_photo, note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt->execute([
            trim($data['first_name']),
            trim($data['middle_name'] ?? '') ?: null,
            trim($data['last_name']),
            trim($data['suffix'] ?? '') ?: null,
            $email,
            $data['role'],
            trim($data['department'] ?? '') ?: 'College of Engineering',
            trim($data['program'] ?? '') ?: null,
            ($data['year_level'] ?? '') !== '' ? (int)$data['year_level'] : null,
            trim($data['student_id'] ?? '') ?: null,
            trim($data['employee_id'] ?? '') ?: null,
            trim($data['contact_number'] ?? '') ?: null,
            $idPhotoPath,
            trim($data['note'] ?? '') ?: null,
        ]);

        $requestId = (int)$this->db->lastInsertId();

        // Notify all active admins
        $admins = $this->db->query("SELECT id FROM users WHERE role = 'admin' AND is_active = 1")->fetchAll();
        $insert = $this->db->prepare("
            INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id)
            VALUES (?, ?, ?, 'system', 'account_request', ?)
        ");

        $fullName = trim($data['first_name'] . ' ' . ($data['middle_name'] ?? '') . ' ' . $data['last_name']);
        $msg = "{$fullName} has requested a new {$data['role']} account ({$email}).";

        foreach ($admins as $admin) {
            $insert->execute([$admin['id'], 'New account request', $msg, $requestId]);
        }

        Logger::info('account_request.created', [
            'request_id' => $requestId,
            'email' => $email,
            'role' => $data['role'],
        ]);

        Response::success(['id' => $requestId], 'Account creation request submitted successfully! Please wait for the admin to review your request. You will receive an email with your login credentials once approved.', 201);
    }

    /**
     * GET /api/account-requests  (Admin only)
     */
    public function index() {
        AuthMiddleware::authorize(['admin']);

        $status = $_GET['status'] ?? 'pending';
        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = 20;
        $offset = ($page - 1) * $limit;

        $where = "WHERE status = ?";
        $params = [$status];

        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM account_requests $where");
        $countStmt->execute($params);
        $total = $countStmt->fetchColumn();

        $stmt = $this->db->prepare("SELECT * FROM account_requests $where ORDER BY created_at DESC LIMIT $limit OFFSET $offset");
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        Response::paginated($rows, $total, $page, $limit);
    }

    /**
     * GET /api/account-requests/:id/photo  (Admin only — serves ID photo)
     */
    public function photo($id) {
        AuthMiddleware::authorize(['admin']);

        $stmt = $this->db->prepare("SELECT id_photo FROM account_requests WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        if (!$row || !$row['id_photo']) {
            Response::error('Photo not found.', 404);
        }

        $filePath = $this->uploadDir . '/' . $row['id_photo'];
        if (!file_exists($filePath)) {
            Response::error('Photo file missing.', 404);
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $filePath);
        finfo_close($finfo);

        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($filePath));
        header('Cache-Control: private, max-age=60');
        readfile($filePath);
        exit;
    }

    /**
     * POST /api/account-requests/:id/approve  (Admin only)
     * Creates the user account, sends welcome email, deletes ID photo.
     */
    public function approve($id) {
        $auth = AuthMiddleware::authorize(['admin']);

        $stmt = $this->db->prepare("SELECT * FROM account_requests WHERE id = ? AND status = 'pending'");
        $stmt->execute([$id]);
        $req = $stmt->fetch();

        if (!$req) {
            Response::error('Request not found or already processed.', 404);
        }

        // Check email collision
        $check = $this->db->prepare("SELECT id FROM users WHERE email = ?");
        $check->execute([$req['email']]);
        if ($check->fetch()) {
            Response::error('An account with this email already exists. Reject this request instead.', 409);
        }

        // Generate password
        $plainPassword = $this->generateRandomPassword();
        $passwordHash = password_hash($plainPassword, PASSWORD_DEFAULT);

        $this->db->beginTransaction();
        try {
            // Create user
            $ins = $this->db->prepare("INSERT INTO users (employee_id, student_id, first_name, middle_name, last_name, suffix, email, password_hash, role, department, program, year_level, contact_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $ins->execute([
                $req['employee_id'],
                $req['student_id'],
                $req['first_name'],
                $req['middle_name'],
                $req['last_name'],
                $req['suffix'],
                $req['email'],
                $passwordHash,
                $req['role'],
                $req['department'] ?: 'College of Engineering',
                $req['program'],
                $req['year_level'],
                $req['contact_number'],
            ]);
            $userId = (int)$this->db->lastInsertId();

            // Mark request approved
            $upd = $this->db->prepare("UPDATE account_requests SET status = 'approved', resolved_by = ?, resolved_at = NOW() WHERE id = ?");
            $upd->execute([$auth['sub'], $id]);

            $this->db->commit();
        } catch (\Exception $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            Logger::error('account_request.approve.failed', ['id' => $id, 'msg' => $e->getMessage()]);
            Response::error('Failed to create account. ' . $e->getMessage(), 500);
        }

        // Delete ID photo
        if ($req['id_photo']) {
            $photoPath = $this->uploadDir . '/' . $req['id_photo'];
            if (file_exists($photoPath)) {
                @unlink($photoPath);
            }
        }

        // Send welcome email
        $mailer = new Mailer($this->db);
        $recipientName = trim($req['first_name'] . ' ' . $req['last_name']);
        $mailResult = $mailer->sendWelcomeCredentialsEmail($req['email'], $recipientName, $plainPassword, $req['role']);

        $this->logAudit($auth['sub'], 'APPROVE_ACCOUNT_REQUEST', 'user', $userId, null, [
            'request_id' => $id,
            'email' => $req['email'],
            'role' => $req['role'],
        ]);

        Response::success([
            'user_id' => $userId,
            'temporary_password' => $plainPassword,
            'email_sent' => $mailResult['success'],
        ], 'Account created and request approved.');
    }

    /**
     * POST /api/account-requests/:id/reject  (Admin only)
     */
    public function reject($id) {
        $auth = AuthMiddleware::authorize(['admin']);

        $stmt = $this->db->prepare("SELECT * FROM account_requests WHERE id = ? AND status = 'pending'");
        $stmt->execute([$id]);
        $req = $stmt->fetch();

        if (!$req) {
            Response::error('Request not found or already processed.', 404);
        }

        $upd = $this->db->prepare("UPDATE account_requests SET status = 'rejected', resolved_by = ?, resolved_at = NOW() WHERE id = ?");
        $upd->execute([$auth['sub'], $id]);

        // Delete ID photo
        if ($req['id_photo']) {
            $photoPath = $this->uploadDir . '/' . $req['id_photo'];
            if (file_exists($photoPath)) {
                @unlink($photoPath);
            }
        }

        $this->logAudit($auth['sub'], 'REJECT_ACCOUNT_REQUEST', 'account_request', $id, null, [
            'email' => $req['email'],
            'role' => $req['role'],
        ]);

        Response::success(null, 'Request rejected.');
    }

    /* ------------------------------------------------------------------ */

    private function ensureTable() {
        try {
            $this->db->exec("
                CREATE TABLE IF NOT EXISTS account_requests (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    first_name VARCHAR(100) NOT NULL,
                    middle_name VARCHAR(100) DEFAULT NULL,
                    last_name VARCHAR(100) NOT NULL,
                    suffix VARCHAR(20) DEFAULT NULL,
                    email VARCHAR(255) NOT NULL,
                    role ENUM('student','faculty','dean','program_chair') NOT NULL DEFAULT 'student',
                    department VARCHAR(100) DEFAULT 'College of Engineering',
                    program VARCHAR(50) DEFAULT NULL,
                    year_level TINYINT DEFAULT NULL,
                    student_id VARCHAR(50) DEFAULT NULL,
                    employee_id VARCHAR(50) DEFAULT NULL,
                    contact_number VARCHAR(20) DEFAULT NULL,
                    id_photo VARCHAR(255) DEFAULT NULL,
                    note TEXT DEFAULT NULL,
                    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
                    resolved_by INT DEFAULT NULL,
                    resolved_at DATETIME DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
                    INDEX idx_status_created (status, created_at)
                ) ENGINE=InnoDB
            ");
        } catch (\Exception $e) {
            // Table likely already exists — safe to continue
        }
    }

    private function generateRandomPassword($length = 12) {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
        $password = '';
        for ($i = 0; $i < $length; $i++) {
            $password .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        return $password;
    }

    private function logAudit($userId, $action, $entityType = null, $entityId = null, $oldValues = null, $newValues = null) {
        try {
            $stmt = $this->db->prepare("INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$userId, $action, $entityType, $entityId, $oldValues ? json_encode($oldValues) : null, $newValues ? json_encode($newValues) : null, $_SERVER['REMOTE_ADDR'] ?? null, $_SERVER['HTTP_USER_AGENT'] ?? null]);
        } catch (\Exception $e) {}
    }
}
