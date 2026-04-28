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
        $this->ensureSubjectApprovalColumns();
    }

    public function index() {
        $auth = AuthMiddleware::authenticate();
        $search = $_GET['search'] ?? null;
        $status = $_GET['status'] ?? null;
        $context = $_GET['context'] ?? null;
        
        $where = ["s.is_active = 1"];
        $params = [];

        if ($context === 'class_create') {
            $where[] = "s.approval_status = 'approved'";
        }
        
        // Filter by approval status
        if ($status && in_array($status, ['pending', 'approved', 'rejected'])) {
            $where[] = "s.approval_status = ?";
            $params[] = $status;
        }

        if ($auth['role'] === 'faculty' && $context !== 'class_create') {
            $where[] = "(s.created_by = ? OR s.approval_status = 'approved')";
            $params[] = $auth['sub'];
        } elseif ($auth['role'] === 'program_chair') {
            $chairProgram = $this->getUserProgram($auth['sub']);
            if ($chairProgram) {
                $where[] = "(s.program = ? OR s.program IS NULL OR s.program = '')";
                $params[] = $chairProgram;
            }
        } elseif ($auth['role'] === 'student') {
            $where[] = "s.approval_status = 'approved'";
        }
        
        if ($search) {
            $where[] = "(s.code LIKE ? OR s.name LIKE ? OR s.program LIKE ?)";
            $params[] = "%$search%";
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

    public function programs() {
        AuthMiddleware::authorize(['admin', 'faculty', 'program_chair']);

        $stmt = $this->db->query("
            SELECT DISTINCT program
            FROM (
                SELECT program FROM users WHERE is_active = 1 AND program IS NOT NULL AND program <> ''
                UNION
                SELECT program FROM subjects WHERE is_active = 1 AND program IS NOT NULL AND program <> ''
            ) programs
            ORDER BY program
        ");

        Response::success(array_values(array_map(
            fn($row) => $row['program'],
            $stmt->fetchAll()
        )));
    }

    public function create() {
        $auth = AuthMiddleware::authorize(['admin', 'faculty', 'program_chair']);
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) Response::error('Invalid request payload.', 400);
        $data = $this->normalizeSubjectPayload($data);

        if ($auth['role'] === 'faculty' && !array_key_exists('program', $data)) {
            $data['program'] = $this->getUserProgram($auth['sub']);
        }

        $validator = new Validator();
        $validator->required('code', $data['code'] ?? '')
                  ->maxLength('code', $data['code'] ?? '', 20)
                  ->required('name', $data['name'] ?? '')
                  ->maxLength('name', $data['name'] ?? '', 200)
                  ->required('units', $data['units'] ?? '')
                  ->numeric('units', $data['units'] ?? '');
        if (!$validator->isValid()) Response::error('Validation failed.', 422, $validator->getErrors());

        $duplicate = $this->findDuplicateSubject($data);
        if ($duplicate) Response::error($duplicate['message'], 409);

        // Auto-approve for admin and program_chair, pending for faculty
        $approvalStatus = in_array($auth['role'], ['admin', 'program_chair']) ? 'approved' : 'pending';
        $approvedBy = $approvalStatus === 'approved' ? $auth['sub'] : null;
        $approvedAt = $approvalStatus === 'approved' ? date('Y-m-d H:i:s') : null;

        try {
            $this->db->beginTransaction();

            $stmt = $this->db->prepare("
                INSERT INTO subjects (code, name, description, units, department, program, created_by, approval_status, approved_by, approved_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $data['code'],
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
            
            // Notify program chairs if pending approval
            if ($approvalStatus === 'pending') {
                $this->notifyProgramChairs($newId, $data['code'], $data['name'], $data['program'] ?? null);
            }

            $subject = $this->fetchSubject($newId);
            $this->db->commit();
        } catch (PDOException $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            $this->handleSubjectWriteException($e);
        }
        
        $message = $approvalStatus === 'approved' ? 'Subject created and approved.' : 'Subject created. Awaiting approval from Program Chair.';
        Response::success(['id' => $newId, 'approval_status' => $approvalStatus, 'subject' => $subject], $message, 201);
    }

    public function update($id) {
        $auth = AuthMiddleware::authorize(['admin', 'faculty', 'program_chair']);
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) Response::error('Invalid request payload.', 400);
        $data = $this->normalizeSubjectPayload($data, true);

        $existingStmt = $this->db->prepare("SELECT * FROM subjects WHERE id = ? AND is_active = 1");
        $existingStmt->execute([$id]);
        $existing = $existingStmt->fetch();
        if (!$existing) Response::error('Subject not found.', 404);

        if ($auth['role'] === 'faculty' && (int)$existing['created_by'] !== (int)$auth['sub']) {
            Response::error('You can only update subjects you created.', 403);
        }

        if ($auth['role'] === 'program_chair') {
            $chairProgram = $this->getUserProgram($auth['sub']);
            if ($chairProgram && !empty($existing['program']) && $existing['program'] !== $chairProgram) {
                Response::error('You can only update subjects for your program.', 403);
            }
        }

        if (array_key_exists('code', $data) || array_key_exists('name', $data) || array_key_exists('program', $data)) {
            $candidate = array_merge($existing, $data);
            $duplicate = $this->findDuplicateSubject($candidate, (int)$id);
            if ($duplicate) Response::error($duplicate['message'], 409);
        }

        $fields = []; $params = [];
        foreach (['code','name','description','units','department','program'] as $f) {
            if (array_key_exists($f, $data)) { $fields[] = "$f = ?"; $params[] = $data[$f]; }
        }

        $shouldResubmit = $auth['role'] === 'faculty' && $existing['approval_status'] === 'rejected';
        if ($shouldResubmit) {
            $fields[] = "approval_status = 'pending'";
            $fields[] = "approved_by = NULL";
            $fields[] = "approved_at = NULL";
            $fields[] = "rejection_reason = NULL";
        }

        if (empty($fields)) Response::error('No fields to update.', 400);
        $params[] = $id;

        try {
            $this->db->beginTransaction();
            $this->db->prepare("UPDATE subjects SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
            $this->logAudit($auth['sub'], $shouldResubmit ? 'RESUBMIT_SUBJECT' : 'UPDATE_SUBJECT', 'subject', $id, $existing, $data);

            if ($shouldResubmit) {
                $updated = array_merge($existing, $data);
                $this->notifyProgramChairs((int)$id, $updated['code'], $updated['name'], $updated['program'] ?? null);
            }

            $subject = $this->fetchSubject((int)$id);
            $this->db->commit();
        } catch (PDOException $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            $this->handleSubjectWriteException($e);
        }

        Response::success(['subject' => $subject], $shouldResubmit ? 'Subject updated and resubmitted for approval.' : 'Subject updated.');
    }

    public function approve($id) {
        $auth = AuthMiddleware::authorize(['admin', 'program_chair']);
        
        // Get subject details
        $stmt = $this->db->prepare("SELECT * FROM subjects WHERE id = ?");
        $stmt->execute([$id]);
        $subject = $stmt->fetch();
        
        if (!$subject) Response::error('Subject not found.', 404);
        if ($subject['approval_status'] !== 'pending') Response::error('Only pending subjects can be approved.', 409);
        
        // Program chair can only approve subjects for their program
        if ($auth['role'] === 'program_chair') {
            $chairProgram = $this->getUserProgram($auth['sub']);
            
            if ($chairProgram && $subject['program'] && $subject['program'] !== $chairProgram) {
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
        
        // Notify faculty who created the subject
        $this->notifyFaculty($subject['created_by'], $subject['id'], $subject['code'], $subject['name'], 'approved', null);
        
        $this->logAudit($auth['sub'], 'APPROVE_SUBJECT', 'subject', $id);
        Response::success(['subject' => $this->fetchSubject((int)$id)], 'Subject approved successfully.');
    }

    public function reject($id) {
        $auth = AuthMiddleware::authorize(['admin', 'program_chair']);
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) Response::error('Invalid request payload.', 400);
        $reason = trim((string)($data['reason'] ?? ''));

        if (strlen($reason) < 10) {
            Response::error('Please add a cancellation reason with at least 10 characters.', 422);
        }
        
        // Get subject details
        $stmt = $this->db->prepare("SELECT * FROM subjects WHERE id = ?");
        $stmt->execute([$id]);
        $subject = $stmt->fetch();
        
        if (!$subject) Response::error('Subject not found.', 404);
        if ($subject['approval_status'] !== 'pending') Response::error('Only pending subjects can be cancelled.', 409);
        
        // Program chair can only reject subjects for their program
        if ($auth['role'] === 'program_chair') {
            $chairProgram = $this->getUserProgram($auth['sub']);
            
            if ($chairProgram && $subject['program'] && $subject['program'] !== $chairProgram) {
                Response::error('You can only cancel subjects for your program.', 403);
            }
        }
        
        // Reject subject
        $stmt = $this->db->prepare("
            UPDATE subjects 
            SET approval_status = 'rejected', approved_by = ?, approved_at = NOW(), rejection_reason = ? 
            WHERE id = ?
        ");
        $stmt->execute([$auth['sub'], $reason, $id]);
        
        // Notify faculty who created the subject
        $this->notifyFaculty($subject['created_by'], $subject['id'], $subject['code'], $subject['name'], 'rejected', $reason);
        
        $this->logAudit($auth['sub'], 'CANCEL_SUBJECT_APPROVAL', 'subject', $id, null, ['reason' => $reason]);
        Response::success(['subject' => $this->fetchSubject((int)$id)], 'Subject request cancelled.');
    }

    public function delete($id) {
        $auth = AuthMiddleware::authorize(['admin']);
        $this->db->prepare("UPDATE subjects SET is_active = 0 WHERE id = ?")->execute([$id]);
        $this->logAudit($auth['sub'], 'DEACTIVATE_SUBJECT', 'subject', $id);
        Response::success(null, 'Subject deactivated.');
    }

    private function notifyProgramChairs($subjectId, $code, $name, $program = null) {
        try {
            // Get program chairs for the specific program or all program chairs
            $query = "SELECT id FROM users WHERE role = 'program_chair' AND is_active = 1";
            $params = [];
            
            if ($program) {
                $query .= " AND program = ?";
                $params[] = $program;
            }
            
            $stmt = $this->db->prepare($query);
            $stmt->execute($params);
            $programChairs = $stmt->fetchAll();

            if (!$programChairs && $program) {
                $stmt = $this->db->query("SELECT id FROM users WHERE role = 'program_chair' AND is_active = 1");
                $programChairs = $stmt->fetchAll();
            }
            
            foreach ($programChairs as $chair) {
                $this->db->prepare("
                    INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id) 
                    VALUES (?, ?, ?, 'system', 'subject_approval', ?)
                ")->execute([
                    $chair['id'],
                    'New Subject Awaiting Approval',
                    "Subject {$code} - {$name} has been submitted and requires your approval.",
                    $subjectId
                ]);
            }
        } catch (Exception $e) {}
    }

    private function notifyFaculty($facultyId, $subjectId, $code, $name, $status, $reason = null) {
        try {
            $title = $status === 'approved' ? 'Subject Approved' : 'Subject Request Cancelled';
            $message = $status === 'approved' 
                ? "Your subject {$code} - {$name} has been approved by the Program Chair."
                : "Your subject {$code} - {$name} has been cancelled by the Program Chair.\nReason: {$reason}";
            
            $this->db->prepare("
                INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id) 
                VALUES (?, ?, ?, 'system', 'subject_approval', ?)
            ")->execute([$facultyId, $title, $message, $subjectId]);
        } catch (Exception $e) {}
    }

    private function fetchSubject($id) {
        $stmt = $this->db->prepare("
            SELECT s.*, 
                   CONCAT(u.first_name, ' ', u.last_name) as created_by_name,
                   CONCAT(a.first_name, ' ', a.last_name) as approved_by_name
            FROM subjects s
            LEFT JOIN users u ON s.created_by = u.id
            LEFT JOIN users a ON s.approved_by = a.id
            WHERE s.id = ?
            LIMIT 1
        ");
        $stmt->execute([$id]);
        return $stmt->fetch();
    }

    private function getUserProgram($userId) {
        $stmt = $this->db->prepare("SELECT program FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        return trim((string)($user['program'] ?? '')) ?: null;
    }

    private function normalizeSubjectPayload(array $data, $partial = false) {
        foreach (['code', 'name', 'description', 'department', 'program'] as $field) {
            if (array_key_exists($field, $data) && is_string($data[$field])) {
                $data[$field] = preg_replace('/\s+/', ' ', trim($data[$field]));
            }
        }

        if (array_key_exists('code', $data)) {
            $data['code'] = strtoupper((string)$data['code']);
        } elseif (!$partial) {
            $data['code'] = '';
        }

        foreach (['description', 'department', 'program'] as $field) {
            if (array_key_exists($field, $data) && $data[$field] === '') {
                $data[$field] = null;
            }
        }

        return $data;
    }

    private function subjectCodeKey($code) {
        return strtoupper(preg_replace('/[^A-Z0-9]/i', '', (string)$code));
    }

    private function findDuplicateSubject(array $data, $ignoreId = null) {
        $codeKey = $this->subjectCodeKey($data['code'] ?? '');
        if ($codeKey !== '') {
            $params = [$codeKey];
            $sql = "
                SELECT id, code, name, approval_status
                FROM subjects
                WHERE is_active = 1
                  AND UPPER(REPLACE(REPLACE(REPLACE(code, ' ', ''), '-', ''), '.', '')) = ?
            ";
            if ($ignoreId) {
                $sql .= " AND id <> ?";
                $params[] = $ignoreId;
            }
            $sql .= " LIMIT 1";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $existing = $stmt->fetch();
            if ($existing) {
                return ['message' => "Subject code already exists as {$existing['code']} - {$existing['name']}."];
            }
        }

        $name = trim((string)($data['name'] ?? ''));
        if ($name !== '') {
            $program = trim((string)($data['program'] ?? ''));
            $params = [mb_strtolower($name)];
            $sql = "
                SELECT id, code, name
                FROM subjects
                WHERE is_active = 1
                  AND LOWER(TRIM(name)) = ?
            ";

            if ($program === '') {
                $sql .= " AND (program IS NULL OR program = '')";
            } else {
                $sql .= " AND program = ?";
                $params[] = $program;
            }

            if ($ignoreId) {
                $sql .= " AND id <> ?";
                $params[] = $ignoreId;
            }
            $sql .= " LIMIT 1";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $existing = $stmt->fetch();
            if ($existing) {
                return ['message' => "Subject already exists as {$existing['code']} - {$existing['name']}."];
            }
        }

        return null;
    }

    private function handleSubjectWriteException(PDOException $e) {
        if (stripos($e->getMessage(), 'Duplicate entry') !== false && stripos($e->getMessage(), 'code') !== false) {
            Response::error('Subject code already exists.', 409);
        }

        Response::error('Unable to save subject. Please check the details and try again.', 500);
    }

    private function ensureSubjectApprovalColumns() {
        try {
            $columns = [
                'approval_status' => "ALTER TABLE subjects ADD COLUMN approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved' COMMENT 'Approval status for faculty-created subjects' AFTER program",
                'approved_by' => "ALTER TABLE subjects ADD COLUMN approved_by INT DEFAULT NULL COMMENT 'Program Chair or Admin who approved' AFTER approval_status",
                'approved_at' => "ALTER TABLE subjects ADD COLUMN approved_at DATETIME DEFAULT NULL COMMENT 'When the subject was approved' AFTER approved_by",
                'rejection_reason' => "ALTER TABLE subjects ADD COLUMN rejection_reason TEXT DEFAULT NULL COMMENT 'Reason if rejected' AFTER approved_at",
            ];

            foreach ($columns as $column => $sql) {
                $exists = $this->db->query("SHOW COLUMNS FROM subjects LIKE '{$column}'")->fetch();
                if (!$exists) {
                    $this->db->exec($sql);
                }
            }

            $index = $this->db->query("SHOW INDEX FROM subjects WHERE Key_name = 'idx_approval_status'")->fetch();
            if (!$index) {
                $this->db->exec("ALTER TABLE subjects ADD INDEX idx_approval_status (approval_status)");
            }
        } catch (Exception $e) {
            error_log('Subject approval schema check failed: ' . $e->getMessage());
        }
    }

    private function logAudit($userId, $action, $entityType = null, $entityId = null, $oldValues = null, $newValues = null) {
        try {
            $stmt = $this->db->prepare("INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$userId, $action, $entityType, $entityId, $oldValues ? json_encode($oldValues) : null, $newValues ? json_encode($newValues) : null, $_SERVER['REMOTE_ADDR'] ?? null, $_SERVER['HTTP_USER_AGENT'] ?? null]);
        } catch (Exception $e) {}
    }
}
