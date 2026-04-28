<?php
/**
 * C.O.E.D.I.G.O. - Subject Controller
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../utils/Response.php';
require_once __DIR__ . '/../utils/Validator.php';

class SubjectController {
    private $db;

    public function __construct() {
        $database = new Database();
        $this->db = $database->getConnection();
    }

    public function index() {
        AuthMiddleware::authenticate();
        $auth = $_SESSION['user'] ?? null;
        $search = $_GET['search'] ?? null;
        $status = $_GET['status'] ?? null;
        
        $where = ["s.is_active = 1"];
        $params = [];
        
        // Filter by approval status
        if ($status && in_array($status, ['pending', 'approved', 'rejected'])) {
            $where[] = "s.approval_status = ?";
            $params[] = $status;
        } else {
            // Default: show only approved subjects for faculty/students
            if ($auth && in_array($auth['role'], ['faculty', 'student'])) {
                $where[] = "s.approval_status = 'approved'";
            }
        }
        
        if ($search) {
            $where[] = "(s.code LIKE ? OR s.name LIKE ?)";
            $params[] = "%$search%";
            $params[] = "%$search%";
        }
        
        $whereClause = 'WHERE ' . implode(' AND ', $where);
        $stmt = $this->db->prepare("
            SELECT s.*, 
                   CONCAT(u.first_name, ' ', u.last_name) as created_by_name,
                   CONCAT(a.first_name, ' ', a.last_name) as approved_by_name
            FROM subjects s 
            LEFT JOIN users u ON s.created_by = u.id 
            LEFT JOIN users a ON s.approved_by = a.id
            $whereClause 
            ORDER BY s.approval_status ASC, s.code
        ");
        $stmt->execute($params);
        Response::success($stmt->fetchAll());
    }

    public function create() {
        $auth = AuthMiddleware::authorize(['admin', 'faculty', 'program_chair']);
        $data = json_decode(file_get_contents('php://input'), true);
        $validator = new Validator();
        $validator->required('code', $data['code'] ?? '')->required('name', $data['name'] ?? '')->required('units', $data['units'] ?? '');
        if (!$validator->isValid()) Response::error('Validation failed.', 422, $validator->getErrors());

        $check = $this->db->prepare("SELECT id FROM subjects WHERE code = ? AND is_active = 1");
        $check->execute([$data['code']]);
        if ($check->fetch()) Response::error('Subject code already exists.', 409);

        // Auto-approve for admin and program_chair, pending for faculty
        $approvalStatus = in_array($auth['role'], ['admin', 'program_chair']) ? 'approved' : 'pending';
        $approvedBy = $approvalStatus === 'approved' ? $auth['sub'] : null;
        $approvedAt = $approvalStatus === 'approved' ? date('Y-m-d H:i:s') : null;

        $stmt = $this->db->prepare("
            INSERT INTO subjects (code, name, description, units, department, program, created_by, approval_status, approved_by, approved_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            strtoupper($data['code']), 
            $data['name'], 
            $data['description'] ?? null, 
            $data['units'], 
            $data['department'] ?? null, 
            $data['program'] ?? null, 
            $auth['sub'],
            $approvalStatus,
            $approvedBy,
            $approvedAt
        ]);
        $newId = (int)$this->db->lastInsertId();
        $this->logAudit($auth['sub'], 'CREATE_SUBJECT', 'subject', $newId, null, $data);
        
        $message = $approvalStatus === 'approved' ? 'Subject created and approved.' : 'Subject created. Awaiting approval from Program Chair.';
        Response::success(['id' => $newId, 'approval_status' => $approvalStatus], $message, 201);
    }

    public function update($id) {
        $auth = AuthMiddleware::authorize(['admin', 'faculty', 'program_chair']);
        $data = json_decode(file_get_contents('php://input'), true);
        $fields = []; $params = [];
        foreach (['code','name','description','units','department','program'] as $f) {
            if (array_key_exists($f, $data)) { $fields[] = "$f = ?"; $params[] = $data[$f]; }
        }
        if (empty($fields)) Response::error('No fields to update.', 400);
        $params[] = $id;
        $this->db->prepare("UPDATE subjects SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
        $this->logAudit($auth['sub'], 'UPDATE_SUBJECT', 'subject', $id, null, $data);
        Response::success(null, 'Subject updated.');
    }

    public function approve($id) {
        $auth = AuthMiddleware::authorize(['admin', 'program_chair']);
        
        // Get subject details
        $stmt = $this->db->prepare("SELECT * FROM subjects WHERE id = ?");
        $stmt->execute([$id]);
        $subject = $stmt->fetch();
        
        if (!$subject) Response::error('Subject not found.', 404);
        if ($subject['approval_status'] === 'approved') Response::error('Subject already approved.', 400);
        
        // Program chair can only approve subjects for their program
        if ($auth['role'] === 'program_chair') {
            $userStmt = $this->db->prepare("SELECT program FROM users WHERE id = ?");
            $userStmt->execute([$auth['sub']]);
            $user = $userStmt->fetch();
            
            if ($subject['program'] && $subject['program'] !== $user['program']) {
                Response::error('You can only approve subjects for your program.', 403);
            }
        }
        
        // Approve subject
        $stmt = $this->db->prepare("
            UPDATE subjects 
            SET approval_status = 'approved', approved_by = ?, approved_at = NOW(), rejection_reason = NULL 
            WHERE id = ?
        ");
        $stmt->execute([$auth['sub'], $id]);
        
        $this->logAudit($auth['sub'], 'APPROVE_SUBJECT', 'subject', $id);
        Response::success(null, 'Subject approved successfully.');
    }

    public function reject($id) {
        $auth = AuthMiddleware::authorize(['admin', 'program_chair']);
        $data = json_decode(file_get_contents('php://input'), true);
        $reason = $data['reason'] ?? 'No reason provided';
        
        // Get subject details
        $stmt = $this->db->prepare("SELECT * FROM subjects WHERE id = ?");
        $stmt->execute([$id]);
        $subject = $stmt->fetch();
        
        if (!$subject) Response::error('Subject not found.', 404);
        
        // Program chair can only reject subjects for their program
        if ($auth['role'] === 'program_chair') {
            $userStmt = $this->db->prepare("SELECT program FROM users WHERE id = ?");
            $userStmt->execute([$auth['sub']]);
            $user = $userStmt->fetch();
            
            if ($subject['program'] && $subject['program'] !== $user['program']) {
                Response::error('You can only reject subjects for your program.', 403);
            }
        }
        
        // Reject subject
        $stmt = $this->db->prepare("
            UPDATE subjects 
            SET approval_status = 'rejected', approved_by = ?, approved_at = NOW(), rejection_reason = ? 
            WHERE id = ?
        ");
        $stmt->execute([$auth['sub'], $reason, $id]);
        
        $this->logAudit($auth['sub'], 'REJECT_SUBJECT', 'subject', $id, null, ['reason' => $reason]);
        Response::success(null, 'Subject rejected.');
    }

    public function delete($id) {
        $auth = AuthMiddleware::authorize(['admin']);
        $this->db->prepare("UPDATE subjects SET is_active = 0 WHERE id = ?")->execute([$id]);
        $this->logAudit($auth['sub'], 'DEACTIVATE_SUBJECT', 'subject', $id);
        Response::success(null, 'Subject deactivated.');
    }

    private function logAudit($userId, $action, $entityType = null, $entityId = null, $oldValues = null, $newValues = null) {
        try {
            $stmt = $this->db->prepare("INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$userId, $action, $entityType, $entityId, $oldValues ? json_encode($oldValues) : null, $newValues ? json_encode($newValues) : null, $_SERVER['REMOTE_ADDR'] ?? null, $_SERVER['HTTP_USER_AGENT'] ?? null]);
        } catch (Exception $e) {}
    }
}
