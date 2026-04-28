<?php
/**
 * C.O.E.D.I.G.O. - Class Record Controller
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../utils/Response.php';
require_once __DIR__ . '/../utils/Validator.php';

class ClassController {
    private $db;

    public function __construct() {
        $database = new Database();
        $this->db = $database->getConnection();
        $this->ensureClassRecordColumns();
    }

    public function index() {
        $auth = AuthMiddleware::authenticate();
        $where = ["cr.is_active = 1"];
        $params = [];

        if ($auth['role'] === 'faculty') {
            $where[] = "cr.faculty_id = ?";
            $params[] = $auth['sub'];
        }
        if ($auth['role'] === 'student') {
            $where[] = "e.student_id = ?";
            $params[] = $auth['sub'];
        }

        $join = $auth['role'] === 'student' ? "INNER JOIN enrollments e ON cr.id = e.class_record_id" : "";
        $whereClause = 'WHERE ' . implode(' AND ', $where);

        $stmt = $this->db->prepare("SELECT cr.*, s.code as subject_code, s.name as subject_name, s.units, CONCAT(u.first_name, ' ', u.last_name) as faculty_name, (SELECT COUNT(*) FROM enrollments WHERE class_record_id = cr.id AND is_active = 1) as student_count FROM class_records cr INNER JOIN subjects s ON cr.subject_id = s.id INNER JOIN users u ON cr.faculty_id = u.id $join $whereClause ORDER BY cr.academic_year DESC, cr.semester DESC, s.code");
        $stmt->execute($params);
        Response::success($stmt->fetchAll());
    }

    public function show($id) {
        $auth = AuthMiddleware::authenticate();
        $stmt = $this->db->prepare("SELECT cr.*, s.code as subject_code, s.name as subject_name, s.units, s.description as subject_description, CONCAT(u.first_name, ' ', u.last_name) as faculty_name, u.email as faculty_email FROM class_records cr INNER JOIN subjects s ON cr.subject_id = s.id INNER JOIN users u ON cr.faculty_id = u.id WHERE cr.id = ?");
        $stmt->execute([$id]);
        $record = $stmt->fetch();
        if (!$record) Response::error('Class record not found.', 404);

        // Get enrolled students
        $students = $this->db->prepare("SELECT e.id as enrollment_id, e.enrolled_at, u.id as student_id, u.student_id as student_number, u.first_name, u.last_name, u.middle_name, u.program, u.year_level, g.weighted_score, g.final_grade, g.remarks FROM enrollments e INNER JOIN users u ON e.student_id = u.id LEFT JOIN grades g ON e.id = g.enrollment_id WHERE e.class_record_id = ? AND e.is_active = 1 ORDER BY u.last_name, u.first_name");
        $students->execute([$id]);
        $record['students'] = $students->fetchAll();

        Response::success($record);
    }

    public function create() {
        $auth = AuthMiddleware::authorize(['faculty']);
        $data = json_decode(file_get_contents('php://input'), true);

        $validator = new Validator();
        $validator->required('subject_id', $data['subject_id'] ?? '')
                  ->required('section', $data['section'] ?? '')
                  ->required('academic_year', $data['academic_year'] ?? '')
                  ->required('semester', $data['semester'] ?? '');
        if (!$validator->isValid()) Response::error('Validation failed.', 422, $validator->getErrors());

        $stmt = $this->db->prepare("INSERT INTO class_records (subject_id, faculty_id, section, academic_year, semester, schedule, room, max_students) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$data['subject_id'], $auth['sub'], $data['section'], $data['academic_year'], $data['semester'], $data['schedule'] ?? null, $data['room'] ?? null, $data['max_students'] ?? 50]);
        $newId = (int)$this->db->lastInsertId();
        $this->logAudit($auth['sub'], 'CREATE_CLASS_RECORD', 'class_record', $newId, null, $data);
        Response::success(['id' => $newId], 'Class record created.', 201);
    }

    public function update($id) {
        $auth = AuthMiddleware::authorize(['faculty']);
        $data = json_decode(file_get_contents('php://input'), true);

        // Verify ownership
        $stmt = $this->db->prepare("SELECT * FROM class_records WHERE id = ? AND faculty_id = ?");
        $stmt->execute([$id, $auth['sub']]);
        if (!$stmt->fetch()) Response::error('Class record not found or unauthorized.', 404);

        $fields = []; $params = [];
        foreach (['section','academic_year','semester','schedule','room','max_students','attendance_weight'] as $f) {
            if (array_key_exists($f, $data)) {
                if ($f === 'attendance_weight') {
                    $value = max(0, min(100, (float)$data[$f]));
                    $fields[] = "$f = ?";
                    $params[] = $value;
                } else {
                    $fields[] = "$f = ?";
                    $params[] = $data[$f];
                }
            }
        }
        if (empty($fields)) Response::error('No fields to update.', 400);
        $params[] = $id;
        $this->db->prepare("UPDATE class_records SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
        $this->logAudit($auth['sub'], 'UPDATE_CLASS_RECORD', 'class_record', $id, null, $data);
        Response::success(null, 'Class record updated.');
    }

    public function enrollStudents($id) {
        $auth = AuthMiddleware::authorize(['faculty']);
        $data = json_decode(file_get_contents('php://input'), true);

        // Verify ownership
        $stmt = $this->db->prepare("
            SELECT cr.*, s.name AS subject_name
            FROM class_records cr
            INNER JOIN subjects s ON cr.subject_id = s.id
            WHERE cr.id = ? AND cr.faculty_id = ?
        ");
        $stmt->execute([$id, $auth['sub']]);
        $classRecord = $stmt->fetch();
        if (!$classRecord) Response::error('Class record not found or unauthorized.', 404);

        $studentIds = $data['student_ids'] ?? [];
        if (empty($studentIds)) Response::error('No students provided.', 400);

        $enrolled = 0;
        $stmt = $this->db->prepare("INSERT IGNORE INTO enrollments (class_record_id, student_id) VALUES (?, ?)");
        $notification = $this->db->prepare("
            INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id)
            VALUES (?, ?, ?, 'system', 'class_record', ?)
        ");
        foreach ($studentIds as $sid) {
            $stmt->execute([$id, $sid]);
            if ($stmt->rowCount() > 0) {
                $enrolled++;
                $notification->execute([
                    $sid,
                    'New Subject Added',
                    "You were added to {$classRecord['subject_name']} ({$classRecord['section']}) for {$classRecord['semester']} {$classRecord['academic_year']}.",
                    $id,
                ]);
            }
        }
        $this->logAudit($auth['sub'], 'ENROLL_STUDENTS', 'class_record', $id, null, ['enrolled_count' => $enrolled, 'student_ids' => $studentIds]);
        Response::success(['enrolled' => $enrolled], "$enrolled student(s) enrolled.");
    }

    public function removeStudent($classId, $studentId) {
        $auth = AuthMiddleware::authorize(['faculty']);
        $stmt = $this->db->prepare("SELECT * FROM class_records WHERE id = ? AND faculty_id = ?");
        $stmt->execute([$classId, $auth['sub']]);
        if (!$stmt->fetch()) Response::error('Unauthorized.', 403);

        $this->db->prepare("UPDATE enrollments SET is_active = 0 WHERE class_record_id = ? AND student_id = ?")->execute([$classId, $studentId]);
        $this->logAudit($auth['sub'], 'REMOVE_STUDENT', 'class_record', $classId, null, ['student_id' => $studentId]);
        Response::success(null, 'Student removed from class.');
    }

    public function updateStatus($id) {
        $auth = AuthMiddleware::authorize(['faculty']);
        $data = json_decode(file_get_contents('php://input'), true);
        $status = $data['grade_status'] ?? '';

        if (!in_array($status, ['draft', 'faculty_verified', 'officially_released'])) {
            Response::error('Invalid grade status.', 400);
        }

        $stmt = $this->db->prepare("
            SELECT cr.*, s.name AS subject_name
            FROM class_records cr
            INNER JOIN subjects s ON cr.subject_id = s.id
            WHERE cr.id = ? AND cr.faculty_id = ?
        ");
        $stmt->execute([$id, $auth['sub']]);
        $classRecord = $stmt->fetch();
        if (!$classRecord) Response::error('Unauthorized.', 403);

        $verifiedAtSql = "verified_at = NULL";
        $releasedAtSql = "released_at = NULL";

        if ($status === 'faculty_verified') {
            $verifiedAtSql = "verified_at = NOW()";
        } elseif ($status === 'officially_released') {
            $verifiedAtSql = $classRecord['verified_at'] ? "verified_at = verified_at" : "verified_at = NOW()";
            $releasedAtSql = "released_at = NOW()";
        }

        $this->db->prepare("
            UPDATE class_records
            SET grade_status = ?, $verifiedAtSql, $releasedAtSql
            WHERE id = ?
        ")->execute([$status, $id]);

        if ($status === 'faculty_verified' || $status === 'officially_released') {
            $students = $this->db->prepare("SELECT student_id FROM enrollments WHERE class_record_id = ? AND is_active = 1");
            $students->execute([$id]);

            $title = $status === 'faculty_verified' ? 'Grades Verified' : 'Grades Released';
            $message = $status === 'faculty_verified'
                ? "Your live scores for {$classRecord['subject_name']} ({$classRecord['section']}) are now faculty-verified. The current final mark is visible in your portal."
                : "Your grades for {$classRecord['subject_name']} ({$classRecord['section']}) have been officially released.";
            $type = $status === 'faculty_verified' ? 'grade_updated' : 'grade_released';

            $notif = $this->db->prepare("
                INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id)
                VALUES (?, ?, ?, ?, 'class_record', ?)
            ");
            while ($row = $students->fetch()) {
                $notif->execute([$row['student_id'], $title, $message, $type, $id]);
            }
        }

        $this->logAudit($auth['sub'], 'UPDATE_GRADE_STATUS', 'class_record', $id, null, ['status' => $status]);

        Response::success(null, 'Grade status updated.');
    }

    private function logAudit($userId, $action, $entityType = null, $entityId = null, $oldValues = null, $newValues = null) {
        try {
            $stmt = $this->db->prepare("INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$userId, $action, $entityType, $entityId, $oldValues ? json_encode($oldValues) : null, $newValues ? json_encode($newValues) : null, $_SERVER['REMOTE_ADDR'] ?? null, $_SERVER['HTTP_USER_AGENT'] ?? null]);
        } catch (Exception $e) {}
    }

    private function ensureClassRecordColumns() {
        try {
            $column = $this->db->query("SHOW COLUMNS FROM class_records LIKE 'attendance_weight'")->fetch();
            if (!$column) {
                $this->db->exec("ALTER TABLE class_records ADD COLUMN attendance_weight DECIMAL(5,2) DEFAULT 100.00 AFTER max_students");
            }
        } catch (Exception $e) {
            error_log('Class record schema check failed: ' . $e->getMessage());
        }
    }
}
