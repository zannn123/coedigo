<?php
/**
 * C.O.E.D.I.G.O. - Report Controller
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../utils/Response.php';

class ReportController {
    private $db;

    public function __construct() {
        $database = new Database();
        $this->db = $database->getConnection();
    }

    /** GET /api/reports/class/:classId - Grade sheet for a class */
    public function classReport($classId) {
        $auth = AuthMiddleware::authorize(['faculty', 'dean', 'program_chair', 'admin']);

        $class = $this->db->prepare("SELECT cr.*, s.code, s.name as subject_name, s.units, CONCAT(u.first_name, ' ', u.last_name) as faculty_name FROM class_records cr INNER JOIN subjects s ON cr.subject_id = s.id INNER JOIN users u ON cr.faculty_id = u.id WHERE cr.id = ?");
        $class->execute([$classId]);
        $classData = $class->fetch();
        if (!$classData) Response::error('Class not found.', 404);

        $students = $this->db->prepare("SELECT u.student_id as student_number, CONCAT(u.last_name, ', ', u.first_name, COALESCE(CONCAT(' ', u.middle_name), '')) as full_name, u.program, u.year_level, g.major_exam_avg, g.quiz_avg, g.project_avg, g.weighted_score, g.final_grade, g.remarks FROM enrollments e INNER JOIN users u ON e.student_id = u.id LEFT JOIN grades g ON e.id = g.enrollment_id WHERE e.class_record_id = ? AND e.is_active = 1 ORDER BY u.last_name, u.first_name");
        $students->execute([$classId]);

        $summary = $this->db->prepare("SELECT COUNT(*) as total, SUM(CASE WHEN g.remarks = 'Passed' THEN 1 ELSE 0 END) as passed, SUM(CASE WHEN g.remarks = 'Failed' THEN 1 ELSE 0 END) as failed, AVG(g.weighted_score) as avg_score FROM enrollments e LEFT JOIN grades g ON e.id = g.enrollment_id WHERE e.class_record_id = ? AND e.is_active = 1");
        $summary->execute([$classId]);

        Response::success([
            'class' => $classData,
            'students' => $students->fetchAll(),
            'summary' => $summary->fetch()
        ]);
    }

    /** GET /api/reports/dashboard - Dean/PC monitoring dashboard */
    public function monitoringDashboard() {
        $auth = AuthMiddleware::authorize(['dean', 'program_chair', 'admin']);

        $totalStudents = $this->db->query("SELECT COUNT(*) FROM users WHERE role='student' AND is_active=1")->fetchColumn();
        $totalFaculty = $this->db->query("SELECT COUNT(*) FROM users WHERE role='faculty' AND is_active=1")->fetchColumn();
        $totalClasses = $this->db->query("SELECT COUNT(*) FROM class_records WHERE is_active=1")->fetchColumn();
        $totalSubjects = $this->db->query("SELECT COUNT(*) FROM subjects WHERE is_active=1")->fetchColumn();

        $statusDist = $this->db->query("SELECT grade_status, COUNT(*) as count FROM class_records WHERE is_active=1 GROUP BY grade_status")->fetchAll();

        $programPerf = $this->db->query("SELECT u.program, COUNT(DISTINCT u.id) as students, AVG(g.weighted_score) as avg_score, SUM(CASE WHEN g.remarks='Passed' THEN 1 ELSE 0 END) as passed, SUM(CASE WHEN g.remarks='Failed' THEN 1 ELSE 0 END) as failed FROM users u INNER JOIN enrollments e ON u.id = e.student_id INNER JOIN grades g ON e.id = g.enrollment_id WHERE u.program IS NOT NULL GROUP BY u.program")->fetchAll();

        $recentReleases = $this->db->prepare("SELECT cr.id, s.code, s.name, cr.section, cr.released_at, CONCAT(u.first_name, ' ', u.last_name) as faculty FROM class_records cr INNER JOIN subjects s ON cr.subject_id = s.id INNER JOIN users u ON cr.faculty_id = u.id WHERE cr.grade_status = 'officially_released' ORDER BY cr.released_at DESC LIMIT 10");
        $recentReleases->execute();

        Response::success([
            'overview' => [
                'total_students' => (int)$totalStudents,
                'total_faculty' => (int)$totalFaculty,
                'total_classes' => (int)$totalClasses,
                'total_subjects' => (int)$totalSubjects
            ],
            'grade_status_distribution' => $statusDist,
            'program_performance' => $programPerf,
            'recent_releases' => $recentReleases->fetchAll()
        ]);
    }

    /** GET /api/reports/student/:studentId */
    public function studentReport($studentId) {
        $auth = AuthMiddleware::authorize(['faculty', 'dean', 'program_chair', 'admin']);

        $student = $this->db->prepare("SELECT id, student_id, first_name, middle_name, last_name, email, program, year_level FROM users WHERE id = ? AND role = 'student'");
        $student->execute([$studentId]);
        $studentData = $student->fetch();
        if (!$studentData) Response::error('Student not found.', 404);

        $grades = $this->db->prepare("SELECT s.code, s.name, s.units, cr.section, cr.academic_year, cr.semester, cr.grade_status, g.weighted_score, g.final_grade, g.remarks FROM enrollments e INNER JOIN class_records cr ON e.class_record_id = cr.id INNER JOIN subjects s ON cr.subject_id = s.id LEFT JOIN grades g ON e.id = g.enrollment_id WHERE e.student_id = ? AND e.is_active = 1 ORDER BY cr.academic_year DESC, cr.semester DESC");
        $grades->execute([$studentId]);

        Response::success(['student' => $studentData, 'grades' => $grades->fetchAll()]);
    }
}
