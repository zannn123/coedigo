<?php
/**
 * C.O.E.D.I.G.O. - Grade Controller
 * Score encoding, grade computation, and viewing
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../utils/Response.php';

class GradeController {
    private $db;

    public function __construct() {
        $database = new Database();
        $this->db = $database->getConnection();
        $this->ensureAttendanceTable();
    }

    /** GET /api/grades/class/:classId - Get grade book for a class */
    public function getClassGrades($classId) {
        $auth = AuthMiddleware::authorize(['faculty', 'dean', 'program_chair', 'admin']);

        if ($auth['role'] === 'faculty') {
            $check = $this->db->prepare("SELECT id FROM class_records WHERE id = ? AND faculty_id = ?");
            $check->execute([$classId, $auth['sub']]);
            if (!$check->fetch()) Response::error('Unauthorized.', 403);
        }

        $stmt = $this->db->prepare("SELECT e.id as enrollment_id, u.id as student_id, u.student_id as student_number, u.first_name, u.last_name, u.program, u.year_level FROM enrollments e INNER JOIN users u ON e.student_id = u.id WHERE e.class_record_id = ? AND e.is_active = 1 ORDER BY u.last_name, u.first_name");
        $stmt->execute([$classId]);
        $students = $stmt->fetchAll();

        foreach ($students as &$student) {
            $comp = $this->db->prepare("SELECT * FROM grade_components WHERE enrollment_id = ? ORDER BY category, component_name");
            $comp->execute([$student['enrollment_id']]);
            $student['components'] = $comp->fetchAll();

            $grade = $this->db->prepare("SELECT * FROM grades WHERE enrollment_id = ?");
            $grade->execute([$student['enrollment_id']]);
            $student['grade'] = $grade->fetch() ?: null;

            $student['attendance'] = $this->getAttendanceRows($student['enrollment_id']);
            $student['attendance_summary'] = $this->buildAttendanceSummary($student['attendance']);
        }

        Response::success($students);
    }

    /** POST /api/grades/encode - Encode scores (faculty only) */
    public function encodeScores() {
        $auth = AuthMiddleware::authorize(['faculty']);
        $data = json_decode(file_get_contents('php://input'), true);

        $enrollmentId = $data['enrollment_id'] ?? null;
        $components = $data['components'] ?? [];
        $deleteIds = $data['delete_ids'] ?? [];

        if (!$enrollmentId || (!is_array($components) && !is_array($deleteIds))) {
            Response::error('Enrollment ID and score changes are required.', 400);
        }

        // Verify faculty owns this class
        $check = $this->db->prepare("SELECT cr.id FROM enrollments e INNER JOIN class_records cr ON e.class_record_id = cr.id WHERE e.id = ? AND cr.faculty_id = ?");
        $check->execute([$enrollmentId, $auth['sub']]);
        if (!$check->fetch()) Response::error('Unauthorized.', 403);

        $this->db->beginTransaction();
        try {
            $changed = false;

            if (!empty($deleteIds) && is_array($deleteIds)) {
                $deleteIds = array_values(array_filter($deleteIds, function($id) { return is_numeric($id); }));
                if (!empty($deleteIds)) {
                    $placeholders = implode(',', array_fill(0, count($deleteIds), '?'));
                    $delete = $this->db->prepare("DELETE FROM grade_components WHERE id IN ($placeholders) AND enrollment_id = ?");
                    $delete->execute(array_merge($deleteIds, [$enrollmentId]));
                    $changed = $changed || $delete->rowCount() > 0;
                }
            }

            foreach ($components as $comp) {
                $category = trim((string)($comp['category'] ?? ''));
                $componentName = trim((string)($comp['component_name'] ?? ''));
                $maxScore = $this->normalizeDecimal($comp['max_score'] ?? 0, false) ?? 0.0;
                $score = $this->normalizeDecimal($comp['score'] ?? null);

                if ($componentName === '') {
                    continue;
                }

                if (!empty($comp['id'])) {
                    $existing = $this->db->prepare("SELECT id, category, component_name, max_score, score FROM grade_components WHERE id = ? AND enrollment_id = ?");
                    $existing->execute([$comp['id'], $enrollmentId]);
                    $existingComponent = $existing->fetch();

                    if (!$existingComponent) {
                        throw new RuntimeException('Grade component not found.');
                    }

                    if ($this->componentChanged($existingComponent, $category, $componentName, $maxScore, $score)) {
                        $stmt = $this->db->prepare("UPDATE grade_components SET score = ?, max_score = ?, component_name = ?, category = ?, updated_at = NOW() WHERE id = ? AND enrollment_id = ?");
                        $stmt->execute([$score, $maxScore, $componentName, $category, $comp['id'], $enrollmentId]);
                        $changed = true;
                    }
                } else {
                    $stmt = $this->db->prepare("INSERT INTO grade_components (enrollment_id, category, component_name, max_score, score, encoded_by) VALUES (?, ?, ?, ?, ?, ?)");
                    $stmt->execute([$enrollmentId, $category, $componentName, $maxScore, $score, $auth['sub']]);
                    $changed = true;
                }
            }

            $grade = $this->computeGradeInternal($enrollmentId, $auth['sub']);
            $statusReset = $changed ? $this->resetClassStatusToDraft($enrollmentId) : false;
            $savedComponents = $this->getGradeComponents($enrollmentId);

            if ($changed) {
                $this->notifyScoreUpdate($enrollmentId);
            }

            $this->db->commit();

            Response::success([
                'changed' => $changed,
                'status_reset' => $statusReset,
                'grade' => $grade,
                'components' => $savedComponents,
            ], $changed ? 'Scores saved. Final marks remain hidden until verification.' : 'No score changes detected.');
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error('Failed to encode scores.', 500);
        }
    }

    /** POST /api/grades/attendance - Save dated attendance for one enrollment */
    public function saveAttendance() {
        $auth = AuthMiddleware::authorize(['faculty']);
        $data = json_decode(file_get_contents('php://input'), true);

        $enrollmentId = $data['enrollment_id'] ?? null;
        $attendance = $data['attendance'] ?? [];
        $deleteIds = $data['delete_ids'] ?? [];

        if (!$enrollmentId || !is_array($attendance)) {
            Response::error('Enrollment ID and attendance rows are required.', 400);
        }

        $check = $this->db->prepare("SELECT cr.id FROM enrollments e INNER JOIN class_records cr ON e.class_record_id = cr.id WHERE e.id = ? AND cr.faculty_id = ?");
        $check->execute([$enrollmentId, $auth['sub']]);
        if (!$check->fetch()) Response::error('Unauthorized.', 403);

        $this->db->beginTransaction();
        try {
            $changed = false;

            if (!empty($deleteIds) && is_array($deleteIds)) {
                $deleteIds = array_values(array_filter($deleteIds, function($id) { return is_numeric($id); }));
                if (!empty($deleteIds)) {
                    $placeholders = implode(',', array_fill(0, count($deleteIds), '?'));
                    $stmt = $this->db->prepare("DELETE FROM attendance_records WHERE id IN ($placeholders) AND enrollment_id = ?");
                    $stmt->execute(array_merge($deleteIds, [$enrollmentId]));
                    $changed = $changed || $stmt->rowCount() > 0;
                }
            }

            foreach ($attendance as $entry) {
                $date = trim($entry['attendance_date'] ?? '');
                $status = $entry['status'] ?? 'absent';

                if (!$this->isValidDate($date)) {
                    throw new InvalidArgumentException('Attendance dates must use YYYY-MM-DD format.');
                }
                if (!in_array($status, ['present', 'absent'], true)) {
                    throw new InvalidArgumentException('Attendance status must be present or absent.');
                }

                $points = $status === 'present' ? 1 : 0;

                if (!empty($entry['id'])) {
                    $existing = $this->db->prepare("SELECT attendance_date, status FROM attendance_records WHERE id = ? AND enrollment_id = ?");
                    $existing->execute([$entry['id'], $enrollmentId]);
                    $existingRow = $existing->fetch();

                    if (!$existingRow) {
                        throw new RuntimeException('Attendance record not found.');
                    }

                    if ((string)$existingRow['attendance_date'] !== $date || (string)$existingRow['status'] !== $status) {
                        $stmt = $this->db->prepare("UPDATE attendance_records SET attendance_date = ?, status = ?, points = ?, encoded_by = ?, updated_at = NOW() WHERE id = ? AND enrollment_id = ?");
                        $stmt->execute([$date, $status, $points, $auth['sub'], $entry['id'], $enrollmentId]);
                        $changed = true;
                    }
                } else {
                    $stmt = $this->db->prepare("INSERT INTO attendance_records (enrollment_id, attendance_date, status, points, encoded_by) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), points = VALUES(points), encoded_by = VALUES(encoded_by), updated_at = NOW()");
                    $stmt->execute([$enrollmentId, $date, $status, $points, $auth['sub']]);
                    $changed = true;
                }
            }

            $grade = $this->computeGradeInternal($enrollmentId, $auth['sub']);
            $rows = $this->getAttendanceRows($enrollmentId);
            $statusReset = $changed ? $this->resetClassStatusToDraft($enrollmentId) : false;
            $this->db->commit();

            Response::success([
                'attendance' => $rows,
                'attendance_summary' => $this->buildAttendanceSummary($rows),
                'grade' => $grade,
                'changed' => $changed,
                'status_reset' => $statusReset,
            ], $changed ? 'Attendance saved. Final marks remain hidden until verification.' : 'No attendance changes detected.');
        } catch (InvalidArgumentException $e) {
            $this->db->rollBack();
            Response::error($e->getMessage(), 422);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error('Failed to save attendance.', 500);
        }
    }

    /** POST /api/grades/compute/:enrollmentId - Compute grade */
    public function computeGrade($enrollmentId) {
        $auth = AuthMiddleware::authorize(['faculty']);

        $check = $this->db->prepare("SELECT cr.id FROM enrollments e INNER JOIN class_records cr ON e.class_record_id = cr.id WHERE e.id = ? AND cr.faculty_id = ?");
        $check->execute([$enrollmentId, $auth['sub']]);
        if (!$check->fetch()) Response::error('Unauthorized.', 403);

        Response::success($this->computeGradeInternal($enrollmentId, $auth['sub']), 'Grade computed successfully.');
    }

    /** POST /api/grades/compute-class/:classId - Compute all grades for a class */
    public function computeClassGrades($classId) {
        $auth = AuthMiddleware::authorize(['faculty']);
        $check = $this->db->prepare("SELECT id FROM class_records WHERE id = ? AND faculty_id = ?");
        $check->execute([$classId, $auth['sub']]);
        if (!$check->fetch()) Response::error('Unauthorized.', 403);

        $enrollments = $this->db->prepare("SELECT id FROM enrollments WHERE class_record_id = ? AND is_active = 1");
        $enrollments->execute([$classId]);
        $count = 0;
        while ($row = $enrollments->fetch()) {
            $this->computeGradeInternal($row['id']);
            $count++;
        }
        Response::success(['computed' => $count], "$count grade(s) computed.");
    }

    /** GET /api/grades/student - Student views own grades */
    public function studentGrades() {
        $auth = AuthMiddleware::authorize(['student']);
        $stmt = $this->db->prepare("SELECT e.id as enrollment_id, cr.id as class_id, s.code as subject_code, s.name as subject_name, s.units, cr.section, cr.academic_year, cr.semester, cr.schedule, cr.room, cr.grade_status, cr.verified_at, cr.released_at, CONCAT(u.first_name, ' ', u.last_name) as faculty_name, g.major_exam_avg, g.quiz_avg, g.project_avg, g.weighted_score, g.final_grade, g.remarks, g.computed_at FROM enrollments e INNER JOIN class_records cr ON e.class_record_id = cr.id INNER JOIN subjects s ON cr.subject_id = s.id INNER JOIN users u ON cr.faculty_id = u.id LEFT JOIN grades g ON e.id = g.enrollment_id WHERE e.student_id = ? AND e.is_active = 1 ORDER BY cr.academic_year DESC, cr.semester DESC");
        $stmt->execute([$auth['sub']]);

        $grades = $stmt->fetchAll();
        foreach ($grades as &$g) {
            $g['attendance'] = $this->getAttendanceRows($g['enrollment_id']);
            $g['attendance_summary'] = $this->buildAttendanceSummary($g['attendance']);
            $g['can_view_final_grade'] = in_array($g['grade_status'], ['faculty_verified', 'officially_released'], true);

            $comp = $this->db->prepare("SELECT gc.id, gc.category, gc.component_name, gc.max_score, gc.score, gc.encoded_at, gc.updated_at, CONCAT(u.first_name, ' ', u.last_name) as encoded_by_name FROM grade_components gc INNER JOIN users u ON gc.encoded_by = u.id WHERE gc.enrollment_id = ? ORDER BY FIELD(gc.category, 'major_exam', 'quiz', 'project'), gc.component_name");
            $comp->execute([$g['enrollment_id']]);
            $g['components'] = $comp->fetchAll();

            if (!$g['can_view_final_grade']) {
                $g['final_grade'] = null;
                $g['remarks'] = null;
                $g['weighted_score'] = null;
                $g['major_exam_avg'] = null;
                $g['quiz_avg'] = null;
                $g['project_avg'] = null;
            }
        }
        Response::success($grades);
    }

    /** DELETE /api/grades/component/:id */
    public function deleteComponent($id) {
        $auth = AuthMiddleware::authorize(['faculty']);
        $check = $this->db->prepare("SELECT gc.id, gc.enrollment_id FROM grade_components gc INNER JOIN enrollments e ON gc.enrollment_id = e.id INNER JOIN class_records cr ON e.class_record_id = cr.id WHERE gc.id = ? AND cr.faculty_id = ?");
        $check->execute([$id, $auth['sub']]);
        $component = $check->fetch();
        if (!$component) Response::error('Unauthorized.', 403);

        $this->db->beginTransaction();
        try {
            $this->db->prepare("DELETE FROM grade_components WHERE id = ?")->execute([$id]);
            $grade = $this->computeGradeInternal($component['enrollment_id'], $auth['sub']);
            $statusReset = $this->resetClassStatusToDraft($component['enrollment_id']);
            $this->notifyScoreUpdate($component['enrollment_id']);
            $this->db->commit();

            Response::success([
                'grade' => $grade,
                'status_reset' => $statusReset,
            ], 'Component deleted. Final marks remain hidden until verification.');
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error('Failed to delete component.', 500);
        }
    }

    private function computeGradeInternal($enrollmentId, $encodedBy = null) {
        $this->syncAttendanceComponent($enrollmentId, $encodedBy);

        $settings = $this->db->query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('major_exam_weight','quiz_weight','project_weight','passing_grade','grade_scale')")->fetchAll(PDO::FETCH_KEY_PAIR);
        $examWeight = ((float)($settings['major_exam_weight'] ?? 40)) / 100;
        $quizWeight = ((float)($settings['quiz_weight'] ?? 30)) / 100;
        $projWeight = ((float)($settings['project_weight'] ?? 30)) / 100;
        $passingGrade = (float)($settings['passing_grade'] ?? 3.00);
        $gradeScale = explode(',', $settings['grade_scale'] ?? '1.00,1.25,1.50,1.75,2.00,2.25,2.50,2.75,3.00,5.00');

        $stmt = $this->db->prepare("SELECT category, AVG(CASE WHEN max_score > 0 THEN (score / max_score) * 100 ELSE 0 END) as avg_pct FROM grade_components WHERE enrollment_id = ? AND score IS NOT NULL GROUP BY category");
        $stmt->execute([$enrollmentId]);
        $avgs = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        $examAvg = (float)($avgs['major_exam'] ?? 0);
        $quizAvg = (float)($avgs['quiz'] ?? 0);
        $projAvg = (float)($avgs['project'] ?? 0);
        $weighted = ($examAvg * $examWeight) + ($quizAvg * $quizWeight) + ($projAvg * $projWeight);
        $finalGrade = $this->mapToGradeScale($weighted, $gradeScale);
        $remarks = $finalGrade <= $passingGrade ? 'Passed' : 'Failed';

        $existing = $this->db->prepare("SELECT id FROM grades WHERE enrollment_id = ?");
        $existing->execute([$enrollmentId]);
        if ($existing->fetch()) {
            $this->db->prepare("UPDATE grades SET major_exam_avg=?, quiz_avg=?, project_avg=?, weighted_score=?, final_grade=?, remarks=?, computed_at=NOW() WHERE enrollment_id=?")->execute([$examAvg, $quizAvg, $projAvg, $weighted, $finalGrade, $remarks, $enrollmentId]);
        } else {
            $this->db->prepare("INSERT INTO grades (enrollment_id, major_exam_avg, quiz_avg, project_avg, weighted_score, final_grade, remarks, computed_at) VALUES (?,?,?,?,?,?,?,NOW())")->execute([$enrollmentId, $examAvg, $quizAvg, $projAvg, $weighted, $finalGrade, $remarks]);
        }

        return [
            'major_exam_avg' => round($examAvg, 2),
            'quiz_avg' => round($quizAvg, 2),
            'project_avg' => round($projAvg, 2),
            'weighted_score' => round($weighted, 2),
            'final_grade' => $finalGrade,
            'remarks' => $remarks
        ];
    }

    private function ensureAttendanceTable() {
        $this->db->exec("CREATE TABLE IF NOT EXISTS attendance_records (
            id INT AUTO_INCREMENT PRIMARY KEY,
            enrollment_id INT NOT NULL,
            attendance_date DATE NOT NULL,
            status ENUM('present', 'absent') NOT NULL DEFAULT 'absent',
            points DECIMAL(5,2) NOT NULL DEFAULT 0.00,
            encoded_by INT NOT NULL,
            encoded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE,
            FOREIGN KEY (encoded_by) REFERENCES users(id) ON DELETE RESTRICT,
            UNIQUE KEY uk_attendance_entry (enrollment_id, attendance_date),
            INDEX idx_attendance_enrollment (enrollment_id),
            INDEX idx_attendance_date (attendance_date)
        ) ENGINE=InnoDB");
    }

    private function getAttendanceRows($enrollmentId) {
        $stmt = $this->db->prepare("SELECT id, attendance_date, status, points, encoded_at, updated_at FROM attendance_records WHERE enrollment_id = ? ORDER BY attendance_date ASC");
        $stmt->execute([$enrollmentId]);
        return $stmt->fetchAll();
    }

    private function getGradeComponents($enrollmentId) {
        $stmt = $this->db->prepare("SELECT id, category, component_name, max_score, score, encoded_at, updated_at FROM grade_components WHERE enrollment_id = ? ORDER BY category, component_name");
        $stmt->execute([$enrollmentId]);
        return $stmt->fetchAll();
    }

    private function buildAttendanceSummary($rows) {
        $total = count($rows);
        $present = 0;
        $points = 0.0;

        foreach ($rows as $row) {
            if (($row['status'] ?? '') === 'present') $present++;
            $points += (float)($row['points'] ?? 0);
        }

        return [
            'total_sessions' => $total,
            'present_count' => $present,
            'absent_count' => max(0, $total - $present),
            'total_points' => $points,
            'possible_points' => $total,
            'percentage' => $total ? round(($points / $total) * 100, 2) : null
        ];
    }

    private function syncAttendanceComponent($enrollmentId, $encodedBy = null) {
        $rows = $this->getAttendanceRows($enrollmentId);
        $summary = $this->buildAttendanceSummary($rows);
        if ((int)$summary['total_sessions'] === 0) return;

        if (!$encodedBy) {
            $owner = $this->db->prepare("SELECT cr.faculty_id FROM enrollments e INNER JOIN class_records cr ON e.class_record_id = cr.id WHERE e.id = ?");
            $owner->execute([$enrollmentId]);
            $encodedBy = $owner->fetchColumn();
        }
        if (!$encodedBy) return;

        $existing = $this->db->prepare("SELECT id FROM grade_components WHERE enrollment_id = ? AND category = 'project' AND component_name = 'Attendance' LIMIT 1");
        $existing->execute([$enrollmentId]);
        $componentId = $existing->fetchColumn();

        if ($componentId) {
            $stmt = $this->db->prepare("UPDATE grade_components SET max_score = ?, score = ?, encoded_by = ?, updated_at = NOW() WHERE id = ?");
            $stmt->execute([$summary['possible_points'], $summary['total_points'], $encodedBy, $componentId]);
        } else {
            $stmt = $this->db->prepare("INSERT INTO grade_components (enrollment_id, category, component_name, max_score, score, encoded_by) VALUES (?, 'project', 'Attendance', ?, ?, ?)");
            $stmt->execute([$enrollmentId, $summary['possible_points'], $summary['total_points'], $encodedBy]);
        }
    }

    private function isValidDate($date) {
        $parsed = DateTime::createFromFormat('Y-m-d', $date);
        return $parsed && $parsed->format('Y-m-d') === $date;
    }

    private function normalizeDecimal($value, $allowNull = true) {
        if ($value === '' || $value === null) {
            return $allowNull ? null : 0.0;
        }

        return (float)$value;
    }

    private function componentChanged(array $existingComponent, $category, $componentName, $maxScore, $score) {
        return (string)$existingComponent['category'] !== (string)$category
            || trim((string)$existingComponent['component_name']) !== trim((string)$componentName)
            || (float)$existingComponent['max_score'] !== (float)$maxScore
            || $this->normalizeDecimal($existingComponent['score']) !== $this->normalizeDecimal($score);
    }

    private function resetClassStatusToDraft($enrollmentId) {
        $stmt = $this->db->prepare("SELECT cr.id, cr.grade_status FROM enrollments e INNER JOIN class_records cr ON e.class_record_id = cr.id WHERE e.id = ?");
        $stmt->execute([$enrollmentId]);
        $classRecord = $stmt->fetch();

        if (!$classRecord) {
            return false;
        }

        $this->db->prepare("UPDATE class_records SET grade_status = 'draft', verified_at = NULL, released_at = NULL WHERE id = ?")->execute([$classRecord['id']]);

        return (string)$classRecord['grade_status'] !== 'draft';
    }

    private function notifyScoreUpdate($enrollmentId) {
        $context = $this->db->prepare("
            SELECT e.student_id, cr.id AS class_id, s.name AS subject_name, cr.section
            FROM enrollments e
            INNER JOIN class_records cr ON e.class_record_id = cr.id
            INNER JOIN subjects s ON cr.subject_id = s.id
            WHERE e.id = ?
        ");
        $context->execute([$enrollmentId]);
        $row = $context->fetch();

        if (!$row) {
            return;
        }

        $notif = $this->db->prepare("
            INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id)
            VALUES (?, ?, ?, 'grade_updated', 'class_record', ?)
        ");
        $notif->execute([
            $row['student_id'],
            'Scores Updated',
            "Your live scores for {$row['subject_name']} ({$row['section']}) were updated. Final marks stay hidden until faculty verification.",
            $row['class_id'],
        ]);
    }

    private function mapToGradeScale($weighted, $gradeScale) {
        if ($weighted >= 97) return 1.00;
        if ($weighted >= 94) return 1.25;
        if ($weighted >= 91) return 1.50;
        if ($weighted >= 88) return 1.75;
        if ($weighted >= 85) return 2.00;
        if ($weighted >= 82) return 2.25;
        if ($weighted >= 79) return 2.50;
        if ($weighted >= 76) return 2.75;
        if ($weighted >= 75) return 3.00;
        return 5.00;
    }
}
