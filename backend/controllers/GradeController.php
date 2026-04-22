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
        }

        Response::success($students);
    }

    /** POST /api/grades/encode - Encode scores (faculty only) */
    public function encodeScores() {
        $auth = AuthMiddleware::authorize(['faculty']);
        $data = json_decode(file_get_contents('php://input'), true);

        $enrollmentId = $data['enrollment_id'] ?? null;
        $components = $data['components'] ?? [];

        if (!$enrollmentId || empty($components)) {
            Response::error('Enrollment ID and components are required.', 400);
        }

        // Verify faculty owns this class
        $check = $this->db->prepare("SELECT cr.id FROM enrollments e INNER JOIN class_records cr ON e.class_record_id = cr.id WHERE e.id = ? AND cr.faculty_id = ?");
        $check->execute([$enrollmentId, $auth['sub']]);
        if (!$check->fetch()) Response::error('Unauthorized.', 403);

        $this->db->beginTransaction();
        try {
            foreach ($components as $comp) {
                if (!empty($comp['id'])) {
                    $stmt = $this->db->prepare("UPDATE grade_components SET score = ?, max_score = ?, component_name = ?, category = ?, updated_at = NOW() WHERE id = ? AND enrollment_id = ?");
                    $stmt->execute([$comp['score'], $comp['max_score'], $comp['component_name'], $comp['category'], $comp['id'], $enrollmentId]);
                } else {
                    $stmt = $this->db->prepare("INSERT INTO grade_components (enrollment_id, category, component_name, max_score, score, encoded_by) VALUES (?, ?, ?, ?, ?, ?)");
                    $stmt->execute([$enrollmentId, $comp['category'], $comp['component_name'], $comp['max_score'], $comp['score'] ?? null, $auth['sub']]);
                }
            }
            $this->db->commit();
            Response::success(null, 'Scores encoded successfully.');
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error('Failed to encode scores.', 500);
        }
    }

    /** POST /api/grades/compute/:enrollmentId - Compute grade */
    public function computeGrade($enrollmentId) {
        $auth = AuthMiddleware::authorize(['faculty']);

        $check = $this->db->prepare("SELECT cr.id FROM enrollments e INNER JOIN class_records cr ON e.class_record_id = cr.id WHERE e.id = ? AND cr.faculty_id = ?");
        $check->execute([$enrollmentId, $auth['sub']]);
        if (!$check->fetch()) Response::error('Unauthorized.', 403);

        // Get weights from settings
        $settings = $this->db->query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('major_exam_weight','quiz_weight','project_weight','passing_grade','grade_scale')")->fetchAll(PDO::FETCH_KEY_PAIR);

        $examWeight = ((float)($settings['major_exam_weight'] ?? 40)) / 100;
        $quizWeight = ((float)($settings['quiz_weight'] ?? 30)) / 100;
        $projWeight = ((float)($settings['project_weight'] ?? 30)) / 100;
        $passingGrade = (float)($settings['passing_grade'] ?? 3.00);
        $gradeScale = explode(',', $settings['grade_scale'] ?? '1.00,1.25,1.50,1.75,2.00,2.25,2.50,2.75,3.00,5.00');

        // Calculate averages per category
        $stmt = $this->db->prepare("SELECT category, AVG(CASE WHEN max_score > 0 THEN (score / max_score) * 100 ELSE 0 END) as avg_pct FROM grade_components WHERE enrollment_id = ? AND score IS NOT NULL GROUP BY category");
        $stmt->execute([$enrollmentId]);
        $avgs = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        $examAvg = (float)($avgs['major_exam'] ?? 0);
        $quizAvg = (float)($avgs['quiz'] ?? 0);
        $projAvg = (float)($avgs['project'] ?? 0);

        $weighted = ($examAvg * $examWeight) + ($quizAvg * $quizWeight) + ($projAvg * $projWeight);

        // Map weighted score to grade scale
        $finalGrade = $this->mapToGradeScale($weighted, $gradeScale);
        $remarks = $finalGrade <= $passingGrade ? 'Passed' : 'Failed';

        // Upsert grade
        $existing = $this->db->prepare("SELECT id FROM grades WHERE enrollment_id = ?");
        $existing->execute([$enrollmentId]);

        if ($existing->fetch()) {
            $stmt = $this->db->prepare("UPDATE grades SET major_exam_avg = ?, quiz_avg = ?, project_avg = ?, weighted_score = ?, final_grade = ?, remarks = ?, computed_at = NOW() WHERE enrollment_id = ?");
            $stmt->execute([$examAvg, $quizAvg, $projAvg, $weighted, $finalGrade, $remarks, $enrollmentId]);
        } else {
            $stmt = $this->db->prepare("INSERT INTO grades (enrollment_id, major_exam_avg, quiz_avg, project_avg, weighted_score, final_grade, remarks, computed_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())");
            $stmt->execute([$enrollmentId, $examAvg, $quizAvg, $projAvg, $weighted, $finalGrade, $remarks]);
        }

        Response::success([
            'major_exam_avg' => round($examAvg, 2),
            'quiz_avg' => round($quizAvg, 2),
            'project_avg' => round($projAvg, 2),
            'weighted_score' => round($weighted, 2),
            'final_grade' => $finalGrade,
            'remarks' => $remarks
        ], 'Grade computed successfully.');
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
        $stmt = $this->db->prepare("SELECT cr.id as class_id, s.code as subject_code, s.name as subject_name, s.units, cr.section, cr.academic_year, cr.semester, cr.grade_status, CONCAT(u.first_name, ' ', u.last_name) as faculty_name, g.major_exam_avg, g.quiz_avg, g.project_avg, g.weighted_score, g.final_grade, g.remarks FROM enrollments e INNER JOIN class_records cr ON e.class_record_id = cr.id INNER JOIN subjects s ON cr.subject_id = s.id INNER JOIN users u ON cr.faculty_id = u.id LEFT JOIN grades g ON e.id = g.enrollment_id WHERE e.student_id = ? AND e.is_active = 1 ORDER BY cr.academic_year DESC, cr.semester DESC");
        $stmt->execute([$auth['sub']]);

        $grades = $stmt->fetchAll();
        // Only show grades that are officially released or faculty verified
        foreach ($grades as &$g) {
            if ($g['grade_status'] === 'draft') {
                $g['final_grade'] = null;
                $g['remarks'] = 'Pending';
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
        $check = $this->db->prepare("SELECT gc.id FROM grade_components gc INNER JOIN enrollments e ON gc.enrollment_id = e.id INNER JOIN class_records cr ON e.class_record_id = cr.id WHERE gc.id = ? AND cr.faculty_id = ?");
        $check->execute([$id, $auth['sub']]);
        if (!$check->fetch()) Response::error('Unauthorized.', 403);

        $this->db->prepare("DELETE FROM grade_components WHERE id = ?")->execute([$id]);
        Response::success(null, 'Component deleted.');
    }

    private function computeGradeInternal($enrollmentId) {
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
