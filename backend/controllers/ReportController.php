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
        $this->ensureAttendanceTable();
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

    /** GET /api/reports/class/:classId/xlsx - Download class record as Excel workbook */
    public function classRecordXlsx($classId) {
        $auth = AuthMiddleware::authorize(['faculty', 'dean', 'program_chair', 'admin']);
        $data = $this->getClassRecordExportData($classId, $auth);

        if (!class_exists('ZipArchive')) {
            Response::error('Excel export requires the PHP Zip extension.', 500);
        }

        $filename = $this->buildExportFilename($data['class']);
        $xlsx = $this->buildXlsxWorkbook($data);

        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . strlen($xlsx));
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        echo $xlsx;
        exit;
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

    /** GET /api/reports/students - Student roster for Dean/Program Chair dashboard */
    public function studentRoster() {
        AuthMiddleware::authorize(['dean', 'program_chair', 'admin']);

        $search = trim((string)($_GET['search'] ?? ''));
        $where = ["u.role = 'student'", "u.is_active = 1"];
        $params = [];

        if ($search !== '') {
            $where[] = "(u.student_id LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.program LIKE ?)";
            $like = '%' . $search . '%';
            $params = array_merge($params, [$like, $like, $like, $like, $like]);
        }

        $whereClause = implode(' AND ', $where);
        $stmt = $this->db->prepare("
            SELECT
                u.id,
                u.student_id,
                u.first_name,
                u.middle_name,
                u.last_name,
                u.suffix,
                u.email,
                u.program,
                u.year_level,
                COUNT(DISTINCT e.id) AS enrollment_count
            FROM users u
            LEFT JOIN enrollments e ON u.id = e.student_id AND e.is_active = 1
            WHERE $whereClause
            GROUP BY u.id, u.student_id, u.first_name, u.middle_name, u.last_name, u.suffix, u.email, u.program, u.year_level
            ORDER BY u.last_name, u.first_name
        ");
        $stmt->execute($params);

        $students = array_map(function ($row) {
            $row['id'] = (int)$row['id'];
            $row['enrollment_count'] = (int)$row['enrollment_count'];
            return $row;
        }, $stmt->fetchAll());

        Response::success($students);
    }

    /** GET /api/reports/student/:studentId */
    public function studentReport($studentId) {
        $auth = AuthMiddleware::authorize(['faculty', 'dean', 'program_chair', 'admin']);

        $student = $this->db->prepare("SELECT id, student_id, first_name, middle_name, last_name, email, program, year_level FROM users WHERE id = ? AND role = 'student'");
        $student->execute([$studentId]);
        $studentData = $student->fetch();
        if (!$studentData) Response::error('Student not found.', 404);

        $grades = $this->db->prepare("
            SELECT
                e.id AS enrollment_id,
                cr.id AS class_id,
                s.code,
                s.name,
                s.units,
                cr.section,
                cr.academic_year,
                cr.semester,
                cr.grade_status,
                cr.verified_at,
                cr.released_at,
                CONCAT(f.first_name, ' ', f.last_name) AS faculty_name,
                g.weighted_score,
                g.final_grade,
                g.remarks,
                g.computed_at
            FROM enrollments e
            INNER JOIN class_records cr ON e.class_record_id = cr.id
            INNER JOIN subjects s ON cr.subject_id = s.id
            INNER JOIN users f ON cr.faculty_id = f.id
            LEFT JOIN grades g ON e.id = g.enrollment_id
            WHERE e.student_id = ? AND e.is_active = 1
            ORDER BY cr.academic_year DESC, FIELD(cr.semester, '1st', '2nd', 'Summer'), s.code
        ");
        $grades->execute([$studentId]);

        Response::success([
            'student' => $studentData,
            'grades' => $grades->fetchAll(),
        ]);
    }

    private function getClassRecordExportData($classId, $auth) {
        $class = $this->db->prepare("
            SELECT
                cr.*,
                s.code AS subject_code,
                s.name AS subject_name,
                s.units,
                CONCAT(u.first_name, ' ', u.last_name) AS faculty_name
            FROM class_records cr
            INNER JOIN subjects s ON cr.subject_id = s.id
            INNER JOIN users u ON cr.faculty_id = u.id
            WHERE cr.id = ?
        ");
        $class->execute([$classId]);
        $classData = $class->fetch();
        if (!$classData) Response::error('Class not found.', 404);

        if ($auth['role'] === 'faculty' && (int)$classData['faculty_id'] !== (int)$auth['sub']) {
            Response::error('Unauthorized.', 403);
        }

        $students = $this->db->prepare("
            SELECT
                e.id AS enrollment_id,
                u.student_id AS student_number,
                CONCAT(u.last_name, ', ', u.first_name, COALESCE(CONCAT(' ', u.middle_name), '')) AS full_name,
                u.program,
                u.year_level,
                g.major_exam_avg,
                g.quiz_avg,
                g.project_avg,
                g.weighted_score,
                g.final_grade,
                g.remarks,
                COALESCE(a.total_points, 0) AS attendance_points,
                COALESCE(a.possible_points, 0) AS attendance_possible
            FROM enrollments e
            INNER JOIN users u ON e.student_id = u.id
            LEFT JOIN grades g ON e.id = g.enrollment_id
            LEFT JOIN (
                SELECT enrollment_id, SUM(points) AS total_points, COUNT(*) AS possible_points
                FROM attendance_records
                GROUP BY enrollment_id
            ) a ON e.id = a.enrollment_id
            WHERE e.class_record_id = ? AND e.is_active = 1
            ORDER BY u.last_name, u.first_name
        ");
        $students->execute([$classId]);
        $studentRows = $students->fetchAll();

        $components = $this->db->prepare("
            SELECT
                e.id AS enrollment_id,
                gc.category,
                gc.component_name,
                gc.max_score,
                gc.score
            FROM enrollments e
            INNER JOIN grade_components gc ON e.id = gc.enrollment_id
            WHERE e.class_record_id = ?
                AND e.is_active = 1
                AND gc.component_name <> 'Attendance'
            ORDER BY FIELD(gc.category, 'major_exam', 'quiz', 'project'), gc.component_name
        ");
        $components->execute([$classId]);

        $assessmentMap = [];
        $scoreMap = [];
        foreach ($components->fetchAll() as $component) {
            $key = $this->assessmentKey($component['category'], $component['component_name']);
            if (!isset($assessmentMap[$key])) {
                $assessmentMap[$key] = [
                    'key' => $key,
                    'category' => $component['category'],
                    'name' => $component['component_name'],
                    'max_score' => (float)$component['max_score'],
                ];
            } else {
                $assessmentMap[$key]['max_score'] = max((float)$assessmentMap[$key]['max_score'], (float)$component['max_score']);
            }

            $scoreMap[$component['enrollment_id']][$key] = $component['score'];
        }

        $assessments = array_values($assessmentMap);
        usort($assessments, function ($a, $b) {
            $order = ['major_exam' => 0, 'quiz' => 1, 'project' => 2];
            $categoryDiff = ($order[$a['category']] ?? 99) <=> ($order[$b['category']] ?? 99);
            if ($categoryDiff !== 0) return $categoryDiff;
            return strnatcasecmp($a['name'], $b['name']);
        });

        $attendance = $this->db->prepare("
            SELECT
                e.id AS enrollment_id,
                ar.attendance_date,
                ar.status,
                ar.points
            FROM enrollments e
            INNER JOIN attendance_records ar ON e.id = ar.enrollment_id
            WHERE e.class_record_id = ?
                AND e.is_active = 1
            ORDER BY ar.attendance_date ASC
        ");
        $attendance->execute([$classId]);

        $attendanceDates = [];
        $attendanceMap = [];
        foreach ($attendance->fetchAll() as $attendanceRow) {
            $date = (string)$attendanceRow['attendance_date'];
            $attendanceDates[$date] = true;
            $attendanceMap[$attendanceRow['enrollment_id']][$date] = [
                'status' => $attendanceRow['status'],
                'points' => (float)$attendanceRow['points'],
            ];
        }

        return [
            'class' => $classData,
            'students' => $studentRows,
            'assessments' => $assessments,
            'scores' => $scoreMap,
            'attendance_dates' => array_keys($attendanceDates),
            'attendance' => $attendanceMap,
            'settings' => $this->getReportSettings(),
        ];
    }

    private function buildXlsxWorkbook($data) {
        $tempFile = tempnam(sys_get_temp_dir(), 'coedigo-xlsx-');
        $zip = new ZipArchive();

        if ($zip->open($tempFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            Response::error('Failed to prepare Excel export.', 500);
        }

        $zip->addFromString('[Content_Types].xml', $this->xlsxContentTypes());
        $zip->addFromString('_rels/.rels', $this->xlsxRootRels());
        $zip->addFromString('docProps/app.xml', $this->xlsxAppProps());
        $zip->addFromString('docProps/core.xml', $this->xlsxCoreProps());
        $zip->addFromString('xl/workbook.xml', $this->xlsxWorkbook());
        $zip->addFromString('xl/_rels/workbook.xml.rels', $this->xlsxWorkbookRels());
        $zip->addFromString('xl/styles.xml', $this->xlsxStyles());
        $zip->addFromString('xl/worksheets/sheet1.xml', $this->xlsxWorksheet($data));
        $zip->close();

        $content = file_get_contents($tempFile);
        @unlink($tempFile);
        return $content;
    }

    private function xlsxWorksheet($data) {
        $class = $data['class'];
        $settings = $data['settings'] ?? [];
        $weights = $this->getExportWeights($settings);
        $terms = $this->organizeAssessmentsByTerm($data['assessments']);
        $attendanceTerms = $this->splitAttendanceDates($data['attendance_dates'] ?? []);
        $columns = $this->classRecordColumnLayout($terms);
        $attendanceColumns = $this->attendanceColumnLayout($attendanceTerms);
        $lastColumnIndex = max($columns['last'], $attendanceColumns['last']);
        $headerEndColumn = $this->columnName(min(24, $lastColumnIndex));
        $students = array_values($data['students']);
        $displayRows = max(55, count($students));
        $dataStartRow = 12;
        $dataEndRow = $dataStartRow + $displayRows - 1;
        $totalStudentsRow = $dataEndRow + 4;
        $percentagePassingRow = $totalStudentsRow + 1;
        $actionRow = $totalStudentsRow + 2;
        $attendanceStartRow = $totalStudentsRow + 5;
        $rows = [];
        $merges = [];

        foreach ([1, 2, 3, 4, 5] as $row) {
            $merges[] = 'A' . $row . ':' . $headerEndColumn . $row;
        }
        $merges[] = 'A6:F6';
        $merges[] = 'G6:O6';
        $merges[] = 'P6:' . $headerEndColumn . '6';
        $merges[] = 'A7:C7';
        $merges[] = $this->columnName($columns['mid_quiz_start']) . '7:' . $this->columnName($columns['midterm_grade']) . '7';
        $merges[] = $this->columnName($columns['final_quiz_start']) . '7:' . $this->columnName($columns['remarks']) . '7';
        $merges[] = 'A8:A11';
        $merges[] = 'B8:B11';
        $merges[] = $this->columnName($columns['mid_quiz_start']) . '8:' . $this->columnName($columns['mid_quiz_end']) . '8';
        $merges[] = $this->columnName($columns['mid_project_start']) . '8:' . $this->columnName($columns['mid_project_end']) . '8';
        $merges[] = $this->columnName($columns['final_quiz_start']) . '8:' . $this->columnName($columns['final_quiz_end']) . '8';
        $merges[] = $this->columnName($columns['final_project_start']) . '8:' . $this->columnName($columns['final_project_end']) . '8';
        $merges[] = $this->columnName($columns['extended_start']) . '8:' . $this->columnName($columns['extended_end']) . '8';

        $semesterLabel = $this->formatSemesterLabel($class['semester'] ?? '');
        $scheduleLine = 'No. of units: ' . $this->formatNumber($class['units'] ?? '')
            . '  Schedule: ' . ($class['schedule'] ?? '-')
            . '  Room: ' . ($class['room'] ?? '-');

        $rows[] = $this->xlsxRow(1, [['col' => 1, 'value' => 'Republic of the Philippines', 'style' => 1]], 16.5);
        $rows[] = $this->xlsxRow(2, [['col' => 1, 'value' => strtoupper($settings['institution_name'] ?? 'Jose Rizal Memorial State University'), 'style' => 2]], 15);
        $rows[] = $this->xlsxRow(3, [['col' => 1, 'value' => $settings['institution_tagline'] ?? 'The Premier University of Zamboanga del Norte', 'style' => 3]], 15);
        $rows[] = $this->xlsxRow(4, [['col' => 1, 'value' => $settings['campus_name'] ?? 'Dapitan Campus, Dapitan City', 'style' => 1]], 16.5);
        $rows[] = $this->xlsxRow(5, [['col' => 1, 'value' => 'CLASS RECORD', 'style' => 2]], 16.5);
        $rows[] = $this->xlsxRow(6, [
            ['col' => 1, 'value' => 'Subject Code & Descriptive Title: ' . ($class['subject_code'] ?? '') . ' - ' . ($class['subject_name'] ?? ''), 'style' => 4],
            ['col' => 7, 'value' => 'Academic Year : ' . ($class['academic_year'] ?? '') . ($semesterLabel ? ' ' . $semesterLabel : ''), 'style' => 4],
            ['col' => 16, 'value' => 'Instructor/Professor : ' . ($class['faculty_name'] ?? ''), 'style' => 4],
        ], 18.5);
        $rows[] = $this->xlsxRow(7, [
            ['col' => 1, 'value' => $scheduleLine, 'style' => 4],
            ['col' => $columns['mid_quiz_start'], 'value' => 'Midterm Coverage', 'style' => 6],
            ['col' => $columns['final_quiz_start'], 'value' => 'Final Coverage', 'style' => 7],
        ], 16.5);

        $row8 = [
            ['col' => 1, 'value' => 'NO.', 'style' => 8],
            ['col' => 2, 'value' => 'NAMES', 'style' => 8],
            ['col' => $columns['mid_quiz_start'], 'value' => 'Midterm Quiz', 'style' => 8],
            ['col' => $columns['mid_quiz_total'], 'value' => 'Total', 'style' => 8],
            ['col' => $columns['mid_quiz_weighted'], 'value' => 'Midterm Quiz ' . $this->formatNumber($weights['quiz']) . '%', 'style' => 8],
            ['col' => $columns['mid_project_start'], 'value' => 'Performance Task', 'style' => 8],
            ['col' => $columns['mid_attendance_score'], 'value' => 'Attendance', 'style' => 8],
            ['col' => $columns['mid_project_total'], 'value' => 'Total', 'style' => 8],
            ['col' => $columns['mid_project_weighted'], 'value' => 'Project, Ass, SW, R ' . $this->formatNumber($weights['project']) . '%', 'style' => 8],
            ['col' => $columns['mid_exam_score'], 'value' => 'Midterm Exam', 'style' => 8],
            ['col' => $columns['mid_exam_weighted'], 'value' => 'Midterm Exam ' . $this->formatNumber($weights['major_exam']) . '%', 'style' => 8],
            ['col' => $columns['midterm_average'], 'value' => 'Gen. Ave. Midterm', 'style' => 8],
            ['col' => $columns['midterm_grade'], 'value' => 'Midterm Grade', 'style' => 8],
            ['col' => $columns['final_quiz_start'], 'value' => 'Final Quiz', 'style' => 8],
            ['col' => $columns['final_quiz_total'], 'value' => 'Total', 'style' => 8],
            ['col' => $columns['final_quiz_weighted'], 'value' => 'Final Quiz ' . $this->formatNumber($weights['quiz']) . '%', 'style' => 8],
            ['col' => $columns['final_project_start'], 'value' => 'Final Class Participation', 'style' => 8],
            ['col' => $columns['final_attendance_score'], 'value' => 'Attendance', 'style' => 8],
            ['col' => $columns['final_project_total'], 'value' => 'Total', 'style' => 8],
            ['col' => $columns['final_project_weighted'], 'value' => 'Project, Ass, SW, R ' . $this->formatNumber($weights['project']) . '%', 'style' => 8],
            ['col' => $columns['final_exam_score'], 'value' => 'Final Exam', 'style' => 8],
            ['col' => $columns['final_exam_weighted'], 'value' => 'Final Exam ' . $this->formatNumber($weights['major_exam']) . '%', 'style' => 8],
            ['col' => $columns['final_average'], 'value' => 'Gen. Ave Final', 'style' => 8],
            ['col' => $columns['midterm_contribution'], 'value' => 'Midterm', 'style' => 8],
            ['col' => $columns['final_contribution'], 'value' => 'Final', 'style' => 8],
            ['col' => $columns['final_grade'], 'value' => 'Final Grade', 'style' => 8],
            ['col' => $columns['final_rating'], 'value' => 'Final Rating', 'style' => 8],
            ['col' => $columns['extended_start'], 'value' => 'Extended Formula', 'style' => 8],
            ['col' => $columns['remarks'], 'value' => 'Remarks', 'style' => 8],
        ];
        $rows[] = $this->xlsxRow(8, $row8, 18);

        $row9 = [];
        $this->appendAssessmentLabels($row9, $columns['mid_quiz_start'], $columns['mid_quiz_count'], $terms['midterm']['quiz']);
        $this->appendAssessmentLabels($row9, $columns['mid_project_start'], $columns['mid_project_count'], $terms['midterm']['project']);
        $this->appendAssessmentLabels($row9, $columns['final_quiz_start'], $columns['final_quiz_count'], $terms['final']['quiz']);
        $this->appendAssessmentLabels($row9, $columns['final_project_start'], $columns['final_project_count'], $terms['final']['project']);
        $row9 = array_merge($row9, [
            ['col' => $columns['mid_attendance_score'], 'value' => 'Pts', 'style' => 9],
            ['col' => $columns['mid_attendance_rate'], 'value' => '%', 'style' => 9],
            ['col' => $columns['final_attendance_score'], 'value' => 'Pts', 'style' => 9],
            ['col' => $columns['final_attendance_rate'], 'value' => '%', 'style' => 9],
        ]);
        $rows[] = $this->xlsxRow(9, $row9, 28);

        $row10 = [['col' => 3, 'value' => 'Passing Rate', 'style' => 10]];
        $this->appendAssessmentPassingRates($row10, $columns['mid_quiz_start'], $columns['mid_quiz_count'], $terms['midterm']['quiz'], $data);
        $this->appendAssessmentPassingRates($row10, $columns['mid_project_start'], $columns['mid_project_count'], $terms['midterm']['project'], $data);
        $this->appendAssessmentPassingRates($row10, $columns['final_quiz_start'], $columns['final_quiz_count'], $terms['final']['quiz'], $data);
        $this->appendAssessmentPassingRates($row10, $columns['final_project_start'], $columns['final_project_count'], $terms['final']['project'], $data);
        $row10[] = ['col' => $columns['mid_attendance_rate'], 'value' => $this->classAttendanceAverage($data, $attendanceTerms['midterm']), 'type' => 'number', 'style' => 14];
        $row10[] = ['col' => $columns['final_attendance_rate'], 'value' => $this->classAttendanceAverage($data, $attendanceTerms['final']), 'type' => 'number', 'style' => 14];
        $rows[] = $this->xlsxRow(10, $row10, 15.75);

        $row11 = [['col' => 3, 'value' => 'Total Item', 'style' => 10]];
        $this->appendAssessmentMaxScores($row11, $columns['mid_quiz_start'], $columns['mid_quiz_count'], $terms['midterm']['quiz']);
        $this->appendAssessmentMaxScores($row11, $columns['mid_project_start'], $columns['mid_project_count'], $terms['midterm']['project']);
        $this->appendAssessmentMaxScores($row11, $columns['final_quiz_start'], $columns['final_quiz_count'], $terms['final']['quiz']);
        $this->appendAssessmentMaxScores($row11, $columns['final_project_start'], $columns['final_project_count'], $terms['final']['project']);
        $row11 = array_merge($row11, [
            ['col' => $columns['mid_quiz_weighted'], 'value' => $weights['quiz'] / 100, 'type' => 'number', 'style' => 14],
            ['col' => $columns['mid_project_weighted'], 'value' => $weights['project'] / 100, 'type' => 'number', 'style' => 14],
            ['col' => $columns['mid_exam_weighted'], 'value' => $weights['major_exam'] / 100, 'type' => 'number', 'style' => 14],
            ['col' => $columns['final_quiz_weighted'], 'value' => $weights['quiz'] / 100, 'type' => 'number', 'style' => 14],
            ['col' => $columns['final_project_weighted'], 'value' => $weights['project'] / 100, 'type' => 'number', 'style' => 14],
            ['col' => $columns['final_exam_weighted'], 'value' => $weights['major_exam'] / 100, 'type' => 'number', 'style' => 14],
            ['col' => $columns['mid_attendance_score'], 'value' => count($attendanceTerms['midterm']), 'type' => 'number', 'style' => 12],
            ['col' => $columns['final_attendance_score'], 'value' => count($attendanceTerms['final']), 'type' => 'number', 'style' => 12],
            ['col' => $columns['midterm_contribution'], 'value' => 0.5, 'type' => 'number', 'style' => 14],
            ['col' => $columns['final_contribution'], 'value' => 0.5, 'type' => 'number', 'style' => 14],
        ]);
        $rows[] = $this->xlsxRow(11, $row11, 15.75);

        for ($index = 0; $index < $displayRows; $index++) {
            $student = $students[$index] ?? null;
            $rowNumber = $dataStartRow + $index;
            $cells = [
                ['col' => 1, 'value' => $index + 1, 'type' => 'number', 'style' => 12],
                ['col' => 2, 'value' => $student ? ($student['full_name'] ?? '') : '', 'style' => 11],
                ['col' => 3, 'value' => '', 'style' => 11],
            ];
            $merges[] = 'B' . $rowNumber . ':C' . $rowNumber;

            $midtermStats = $student ? $this->calculateTermStats($student, $data, $terms['midterm'], $attendanceTerms['midterm'], $weights) : null;
            $finalStats = $student ? $this->calculateTermStats($student, $data, $terms['final'], $attendanceTerms['final'], $weights) : null;
            $midAttendance = $student ? $this->attendanceSummaryForDates($student, $data, $attendanceTerms['midterm']) : null;
            $finalAttendance = $student ? $this->attendanceSummaryForDates($student, $data, $attendanceTerms['final']) : null;

            $this->appendAssessmentScores($cells, $columns['mid_quiz_start'], $columns['mid_quiz_count'], $terms['midterm']['quiz'], $data, $student);
            $cells[] = $this->xlsxNumberCell($columns['mid_quiz_total'], $midtermStats['quiz_pct'] ?? null, 13);
            $cells[] = $this->xlsxNumberCell($columns['mid_quiz_weighted'], $midtermStats['quiz_weighted'] ?? null, 13);
            $this->appendAssessmentScores($cells, $columns['mid_project_start'], $columns['mid_project_count'], $terms['midterm']['project'], $data, $student);
            $cells[] = $this->xlsxNumberCell($columns['mid_attendance_score'], $midAttendance['points'] ?? null, 12);
            $cells[] = $this->xlsxNumberCell($columns['mid_attendance_rate'], $midAttendance['percentage'] ?? null, 13);
            $cells[] = $this->xlsxNumberCell($columns['mid_project_total'], $midtermStats['project_pct'] ?? null, 13);
            $cells[] = $this->xlsxNumberCell($columns['mid_project_weighted'], $midtermStats['project_weighted'] ?? null, 13);
            $cells[] = $this->xlsxNumberCell($columns['mid_exam_score'], $midtermStats['exam_score'] ?? null, 12);
            $cells[] = $this->xlsxNumberCell($columns['mid_exam_weighted'], $midtermStats['exam_weighted'] ?? null, 13);
            $cells[] = $this->xlsxNumberCell($columns['midterm_average'], $midtermStats['weighted_score'] ?? null, 13);
            $cells[] = $this->xlsxNumberCell($columns['midterm_grade'], $midtermStats['weighted_score'] ?? null, 13);

            $this->appendAssessmentScores($cells, $columns['final_quiz_start'], $columns['final_quiz_count'], $terms['final']['quiz'], $data, $student);
            $cells[] = $this->xlsxNumberCell($columns['final_quiz_total'], $finalStats['quiz_pct'] ?? null, 13);
            $cells[] = $this->xlsxNumberCell($columns['final_quiz_weighted'], $finalStats['quiz_weighted'] ?? null, 13);
            $this->appendAssessmentScores($cells, $columns['final_project_start'], $columns['final_project_count'], $terms['final']['project'], $data, $student);
            $cells[] = $this->xlsxNumberCell($columns['final_attendance_score'], $finalAttendance['points'] ?? null, 12);
            $cells[] = $this->xlsxNumberCell($columns['final_attendance_rate'], $finalAttendance['percentage'] ?? null, 13);
            $cells[] = $this->xlsxNumberCell($columns['final_project_total'], $finalStats['project_pct'] ?? null, 13);
            $cells[] = $this->xlsxNumberCell($columns['final_project_weighted'], $finalStats['project_weighted'] ?? null, 13);
            $cells[] = $this->xlsxNumberCell($columns['final_exam_score'], $finalStats['exam_score'] ?? null, 12);
            $cells[] = $this->xlsxNumberCell($columns['final_exam_weighted'], $finalStats['exam_weighted'] ?? null, 13);
            $cells[] = $this->xlsxNumberCell($columns['final_average'], $finalStats['weighted_score'] ?? null, 13);
            $cells[] = $this->xlsxNumberCell($columns['midterm_contribution'], isset($midtermStats['weighted_score']) ? $midtermStats['weighted_score'] * 0.5 : null, 13);
            $cells[] = $this->xlsxNumberCell($columns['final_contribution'], isset($finalStats['weighted_score']) ? $finalStats['weighted_score'] * 0.5 : null, 13);
            $cells[] = $this->xlsxNumberCell($columns['final_grade'], $student['weighted_score'] ?? null, 13);
            $cells[] = $this->xlsxNumberCell($columns['final_rating'], $student['final_grade'] ?? null, 13);
            for ($col = $columns['extended_start']; $col <= $columns['extended_end']; $col++) {
                $cells[] = ['col' => $col, 'value' => '', 'style' => 11];
            }
            $cells[] = [
                'col' => $columns['remarks'],
                'value' => $student ? strtoupper((string)($student['remarks'] ?? '')) : '',
                'style' => $this->remarksStyle($student['remarks'] ?? ''),
            ];
            $rows[] = $this->xlsxRow($rowNumber, $cells, $index < 1 ? 15.75 : 17.25);
        }

        $passingRate = $this->classPassingRate($students);
        $rows[] = $this->xlsxRow($totalStudentsRow, [
            ['col' => 2, 'value' => 'Total Students:     ' . count($students), 'style' => 4],
        ], 17);
        $rows[] = $this->xlsxRow($percentagePassingRow, [
            ['col' => 2, 'value' => 'Percentage Passing', 'style' => 4],
            ['col' => $columns['final_grade'], 'value' => $passingRate, 'type' => 'number', 'style' => 14],
        ], 17);
        $rows[] = $this->xlsxRow($actionRow, [
            ['col' => 2, 'value' => 'Action Taken', 'style' => 4],
        ], 17);

        $this->appendAttendanceSection($rows, $merges, $attendanceStartRow, $displayRows, $students, $data, $attendanceTerms, $attendanceColumns);

        $columnWidths = $this->classRecordColumnWidths($lastColumnIndex, $columns, $attendanceColumns);
        $mergeXml = '';
        $mergeRefs = array_values(array_unique($merges));
        foreach ($mergeRefs as $merge) {
            $mergeXml .= '<mergeCell ref="' . $merge . '"/>';
        }

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<sheetPr><tabColor rgb="FF92D050"/></sheetPr>'
            . '<sheetViews><sheetView workbookViewId="0"><pane xSplit="3" ySplit="11" topLeftCell="D12" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>'
            . '<sheetFormatPr defaultRowHeight="15"/>'
            . '<cols>' . $columnWidths . '</cols>'
            . '<sheetData>' . implode('', $rows) . '</sheetData>'
            . '<mergeCells count="' . count($mergeRefs) . '">' . $mergeXml . '</mergeCells>'
            . '<pageMargins left="0.04" right="0.04" top="0.47" bottom="0.47" header="0.08" footer="0.12"/>'
            . '<pageSetup paperSize="9" scale="85" orientation="landscape" pageOrder="overThenDown"/>'
            . '</worksheet>';
    }

    private function xlsxRow($rowNumber, $cells, $height = null) {
        $heightAttr = $height !== null ? ' ht="' . $this->xmlEscape((string)$height) . '" customHeight="1"' : '';
        $xml = '<row r="' . $rowNumber . '"' . $heightAttr . '>';
        usort($cells, function ($a, $b) {
            return (int)($a['col'] ?? 0) <=> (int)($b['col'] ?? 0);
        });
        foreach ($cells as $index => $cell) {
            $columnIndex = isset($cell['col']) ? (int)$cell['col'] : $index + 1;
            $xml .= $this->xlsxCell($rowNumber, $columnIndex, $cell);
        }
        return $xml . '</row>';
    }

    private function xlsxCell($rowNumber, $columnIndex, $cell) {
        $value = $cell['value'] ?? '';
        if ($value === null) $value = '';
        $style = isset($cell['style']) ? ' s="' . (int)$cell['style'] . '"' : '';
        $reference = $this->columnName($columnIndex) . $rowNumber;
        $type = $cell['type'] ?? 'string';

        if ($value === '' && !isset($cell['formula'])) {
            return '<c r="' . $reference . '"' . $style . '/>';
        }

        if (isset($cell['formula'])) {
            $cached = is_numeric($value) ? '<v>' . $this->xmlEscape((string)$value) . '</v>' : '';
            return '<c r="' . $reference . '"' . $style . '><f>' . $this->xmlEscape((string)$cell['formula']) . '</f>' . $cached . '</c>';
        }

        if ($type === 'number' && is_numeric($value)) {
            return '<c r="' . $reference . '"' . $style . '><v>' . $this->xmlEscape((string)$value) . '</v></c>';
        }

        $text = (string)$value;
        $space = preg_match('/^\s|\s$| {2,}/', $text) ? ' xml:space="preserve"' : '';
        return '<c r="' . $reference . '" t="inlineStr"' . $style . '><is><t' . $space . '>' . $this->xmlEscape($text) . '</t></is></c>';
    }

    private function getReportSettings() {
        $defaults = [
            'institution_name' => getenv('INSTITUTION_NAME') ?: 'Jose Rizal Memorial State University',
            'institution_tagline' => getenv('INSTITUTION_TAGLINE') ?: 'The Premier University of Zamboanga del Norte',
            'campus_name' => getenv('CAMPUS_NAME') ?: 'Dapitan Campus, Dapitan City',
            'major_exam_weight' => '30',
            'quiz_weight' => '30',
            'project_weight' => '40',
        ];

        try {
            $keys = [
                'institution_name',
                'institution_tagline',
                'campus_name',
                'major_exam_weight',
                'quiz_weight',
                'project_weight',
            ];
            $placeholders = implode(',', array_fill(0, count($keys), '?'));
            $stmt = $this->db->prepare("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ($placeholders)");
            $stmt->execute($keys);
            foreach ($stmt->fetchAll(PDO::FETCH_KEY_PAIR) as $key => $value) {
                if ($value !== null && $value !== '') {
                    $defaults[$key] = $value;
                }
            }
        } catch (Throwable $e) {
            // The export still works with defaults if system settings are unavailable.
        }

        return $defaults;
    }

    private function getExportWeights($settings) {
        $weights = [
            'major_exam' => (float)($settings['major_exam_weight'] ?? 30),
            'quiz' => (float)($settings['quiz_weight'] ?? 30),
            'project' => (float)($settings['project_weight'] ?? 40),
        ];

        if (($weights['major_exam'] + $weights['quiz'] + $weights['project']) <= 0) {
            return ['major_exam' => 30, 'quiz' => 30, 'project' => 40];
        }

        return $weights;
    }

    private function organizeAssessmentsByTerm($assessments) {
        $terms = [
            'midterm' => ['major_exam' => [], 'quiz' => [], 'project' => []],
            'final' => ['major_exam' => [], 'quiz' => [], 'project' => []],
        ];
        $categories = ['major_exam', 'quiz', 'project'];

        foreach ($categories as $category) {
            $categoryAssessments = array_values(array_filter($assessments, function ($assessment) use ($category) {
                return ($assessment['category'] ?? '') === $category;
            }));
            $unassigned = [];
            $assignedCount = 0;

            foreach ($categoryAssessments as $assessment) {
                $term = $this->detectAssessmentTerm($assessment['name'] ?? '');
                if ($term) {
                    $terms[$term][$category][] = $assessment;
                    $assignedCount++;
                } else {
                    $unassigned[] = $assessment;
                }
            }

            if (empty($unassigned)) {
                continue;
            }

            if ($assignedCount === 0) {
                $midtermCount = (int)ceil(count($unassigned) / 2);
                foreach ($unassigned as $index => $assessment) {
                    $target = $index < $midtermCount ? 'midterm' : 'final';
                    $terms[$target][$category][] = $assessment;
                }
                continue;
            }

            foreach ($unassigned as $assessment) {
                $terms['midterm'][$category][] = $assessment;
            }
        }

        return $terms;
    }

    private function detectAssessmentTerm($name) {
        $text = strtolower((string)$name);
        if (preg_match('/\bfinal\b|\bfinals\b|\bfin\b/', $text)) {
            return 'final';
        }
        if (preg_match('/\bmidterm\b|\bmid-term\b|\bmid\b|\bprelim\b/', $text)) {
            return 'midterm';
        }
        return null;
    }

    private function splitAttendanceDates($dates) {
        $dates = array_values(array_unique(array_filter($dates)));
        sort($dates);
        $midtermCount = (int)ceil(count($dates) / 2);

        return [
            'midterm' => array_slice($dates, 0, $midtermCount),
            'final' => array_slice($dates, $midtermCount),
        ];
    }

    private function classRecordColumnLayout($terms) {
        $layout = [];
        $col = 4;

        $layout['mid_quiz_start'] = $col;
        $layout['mid_quiz_count'] = max(11, count($terms['midterm']['quiz']));
        $layout['mid_quiz_end'] = $col + $layout['mid_quiz_count'] - 1;
        $col += $layout['mid_quiz_count'];
        $layout['mid_quiz_total'] = $col++;
        $layout['mid_quiz_weighted'] = $col++;

        $layout['mid_project_start'] = $col;
        $layout['mid_project_count'] = max(10, count($terms['midterm']['project']));
        $layout['mid_project_end'] = $col + $layout['mid_project_count'] - 1;
        $col += $layout['mid_project_count'];
        $layout['mid_attendance_score'] = $col++;
        $layout['mid_attendance_rate'] = $col++;
        $layout['mid_project_total'] = $col++;
        $layout['mid_project_weighted'] = $col++;
        $layout['mid_exam_score'] = $col++;
        $layout['mid_exam_weighted'] = $col++;
        $layout['midterm_average'] = $col++;
        $layout['midterm_grade'] = $col++;

        $layout['final_quiz_start'] = $col;
        $layout['final_quiz_count'] = max(10, count($terms['final']['quiz']));
        $layout['final_quiz_end'] = $col + $layout['final_quiz_count'] - 1;
        $col += $layout['final_quiz_count'];
        $layout['final_quiz_total'] = $col++;
        $layout['final_quiz_weighted'] = $col++;

        $layout['final_project_start'] = $col;
        $layout['final_project_count'] = max(10, count($terms['final']['project']));
        $layout['final_project_end'] = $col + $layout['final_project_count'] - 1;
        $col += $layout['final_project_count'];
        $layout['final_attendance_score'] = $col++;
        $layout['final_attendance_rate'] = $col++;
        $layout['final_project_total'] = $col++;
        $layout['final_project_weighted'] = $col++;
        $layout['final_exam_score'] = $col++;
        $layout['final_exam_weighted'] = $col++;
        $layout['final_average'] = $col++;
        $layout['midterm_contribution'] = $col++;
        $layout['final_contribution'] = $col++;
        $layout['final_grade'] = $col++;
        $layout['final_rating'] = $col++;
        $layout['extended_start'] = $col;
        $layout['extended_end'] = $col + 2;
        $col += 3;
        $layout['remarks'] = $col++;
        $layout['last'] = $col - 1;

        return $layout;
    }

    private function attendanceColumnLayout($attendanceTerms) {
        $layout = [];
        $col = 4;

        $layout['mid_start'] = $col;
        $layout['mid_count'] = max(30, count($attendanceTerms['midterm']));
        $layout['mid_end'] = $col + $layout['mid_count'] - 1;
        $col += $layout['mid_count'];
        $layout['mid_total'] = $col++;
        $layout['final_start'] = $col;
        $layout['final_count'] = max(30, count($attendanceTerms['final']));
        $layout['final_end'] = $col + $layout['final_count'] - 1;
        $col += $layout['final_count'];
        $layout['final_total'] = $col++;
        $layout['last'] = $col - 1;

        return $layout;
    }

    private function appendAssessmentLabels(&$cells, $startColumn, $slotCount, $assessments) {
        for ($i = 0; $i < $slotCount; $i++) {
            $assessment = $assessments[$i] ?? null;
            $cells[] = [
                'col' => $startColumn + $i,
                'value' => $assessment ? (string)$assessment['name'] : '',
                'style' => 9,
            ];
        }
    }

    private function appendAssessmentPassingRates(&$cells, $startColumn, $slotCount, $assessments, $data) {
        for ($i = 0; $i < $slotCount; $i++) {
            $assessment = $assessments[$i] ?? null;
            $value = $assessment ? $this->assessmentClassAverage($assessment, $data) : null;
            $cells[] = $this->xlsxNumberCell($startColumn + $i, $value, 14, 4);
        }
    }

    private function appendAssessmentMaxScores(&$cells, $startColumn, $slotCount, $assessments) {
        for ($i = 0; $i < $slotCount; $i++) {
            $assessment = $assessments[$i] ?? null;
            $value = $assessment ? ($assessment['max_score'] ?? null) : null;
            $cells[] = $this->xlsxNumberCell($startColumn + $i, $value, 12);
        }
    }

    private function appendAssessmentScores(&$cells, $startColumn, $slotCount, $assessments, $data, $student) {
        for ($i = 0; $i < $slotCount; $i++) {
            $assessment = $assessments[$i] ?? null;
            $value = ($student && $assessment) ? $this->studentAssessmentScore($data, $student, $assessment) : null;
            $cells[] = $this->xlsxNumberCell($startColumn + $i, $value, 12);
        }
    }

    private function xlsxNumberCell($column, $value, $style = 12, $decimals = 2) {
        if ($value === null || $value === '' || !is_numeric($value)) {
            return [
                'col' => $column,
                'value' => 0,
                'type' => 'number',
                'style' => $style,
            ];
        }

        return [
            'col' => $column,
            'value' => round((float)$value, $decimals),
            'type' => 'number',
            'style' => $style,
        ];
    }

    private function studentAssessmentScore($data, $student, $assessment) {
        if (!$student || !$assessment) return null;
        return $data['scores'][$student['enrollment_id']][$assessment['key']] ?? null;
    }

    private function assessmentClassAverage($assessment, $data) {
        $values = [];
        $maxScore = (float)($assessment['max_score'] ?? 0);
        if ($maxScore <= 0) return null;

        foreach ($data['students'] as $student) {
            $score = $this->studentAssessmentScore($data, $student, $assessment);
            if (is_numeric($score)) {
                $values[] = ((float)$score / $maxScore);
            }
        }

        return $this->averageValues($values);
    }

    private function calculateTermStats($student, $data, $termAssessments, $attendanceDates, $weights) {
        $quizPct = $this->assessmentPercentageAverage($student, $data, $termAssessments['quiz']);
        $projectValues = $this->assessmentPercentageValues($student, $data, $termAssessments['project']);
        $attendance = $this->attendanceSummaryForDates($student, $data, $attendanceDates);
        if ($attendance && $attendance['percentage'] !== null) {
            $projectValues[] = (($attendance['percentage'] / 100) * 50) + 50;
        }
        $projectPct = $this->averageValues($projectValues);
        $examPct = $this->assessmentPercentageAverage($student, $data, $termAssessments['major_exam']);
        $examScore = $this->assessmentRawScoreAverage($student, $data, $termAssessments['major_exam']);
        $hasAny = $quizPct !== null || $projectPct !== null || $examPct !== null;
        $weightedScore = $hasAny
            ? (($quizPct ?? 0) * ($weights['quiz'] / 100))
                + (($projectPct ?? 0) * ($weights['project'] / 100))
                + (($examPct ?? 0) * ($weights['major_exam'] / 100))
            : null;

        return [
            'quiz_pct' => $quizPct,
            'quiz_weighted' => $quizPct !== null ? $quizPct * ($weights['quiz'] / 100) : null,
            'project_pct' => $projectPct,
            'project_weighted' => $projectPct !== null ? $projectPct * ($weights['project'] / 100) : null,
            'exam_score' => $examScore,
            'exam_pct' => $examPct,
            'exam_weighted' => $examPct !== null ? $examPct * ($weights['major_exam'] / 100) : null,
            'weighted_score' => $weightedScore,
        ];
    }

    private function assessmentPercentageAverage($student, $data, $assessments) {
        return $this->averageValues($this->assessmentPercentageValues($student, $data, $assessments));
    }

    private function assessmentPercentageValues($student, $data, $assessments) {
        $values = [];
        foreach ($assessments as $assessment) {
            $maxScore = (float)($assessment['max_score'] ?? 0);
            $score = $this->studentAssessmentScore($data, $student, $assessment);
            if ($maxScore > 0 && is_numeric($score)) {
                $values[] = (((float)$score / $maxScore) * 50) + 50;
            }
        }
        return $values;
    }

    private function assessmentRawScoreAverage($student, $data, $assessments) {
        $values = [];
        foreach ($assessments as $assessment) {
            $score = $this->studentAssessmentScore($data, $student, $assessment);
            if (is_numeric($score)) {
                $values[] = (float)$score;
            }
        }
        return $this->averageValues($values);
    }

    private function attendanceSummaryForDates($student, $data, $dates) {
        if (!$student || empty($dates)) {
            return ['points' => null, 'possible' => 0, 'percentage' => null];
        }

        $attendanceMap = $data['attendance'][$student['enrollment_id']] ?? [];
        $points = 0.0;
        foreach ($dates as $date) {
            if (isset($attendanceMap[$date])) {
                $points += (float)($attendanceMap[$date]['points'] ?? 0);
            }
        }

        $possible = count($dates);
        return [
            'points' => $points,
            'possible' => $possible,
            'percentage' => $possible > 0 ? ($points / $possible) * 100 : null,
        ];
    }

    private function classAttendanceAverage($data, $dates) {
        if (empty($dates) || empty($data['students'])) return null;
        $values = [];
        foreach ($data['students'] as $student) {
            $summary = $this->attendanceSummaryForDates($student, $data, $dates);
            if ($summary['percentage'] !== null) {
                $values[] = $summary['percentage'] / 100;
            }
        }
        return $this->averageValues($values);
    }

    private function classPassingRate($students) {
        if (empty($students)) return null;
        $passed = 0;
        foreach ($students as $student) {
            if (strcasecmp((string)($student['remarks'] ?? ''), 'Passed') === 0) {
                $passed++;
            }
        }
        return $passed / count($students);
    }

    private function averageValues($values) {
        $values = array_values(array_filter($values, function ($value) {
            return $value !== null && $value !== '' && is_numeric($value);
        }));
        if (empty($values)) return null;
        return array_sum($values) / count($values);
    }

    private function appendAttendanceSection(&$rows, &$merges, $startRow, $displayRows, $students, $data, $attendanceTerms, $columns) {
        $merges[] = 'A' . $startRow . ':A' . ($startRow + 1);
        $merges[] = 'B' . $startRow . ':C' . ($startRow + 1);
        $merges[] = $this->columnName($columns['mid_start']) . $startRow . ':' . $this->columnName($columns['mid_end']) . $startRow;
        $merges[] = $this->columnName($columns['final_start']) . $startRow . ':' . $this->columnName($columns['final_end']) . $startRow;

        $rows[] = $this->xlsxRow($startRow, [
            ['col' => 1, 'value' => 'NO', 'style' => 15],
            ['col' => 2, 'value' => 'NAMES', 'style' => 15],
            ['col' => $columns['mid_start'], 'value' => 'Midterm Attendance', 'style' => 15],
            ['col' => $columns['mid_total'], 'value' => 'Total', 'style' => 15],
            ['col' => $columns['final_start'], 'value' => 'Final Attendance', 'style' => 15],
            ['col' => $columns['final_total'], 'value' => 'Total', 'style' => 15],
        ], 18);

        $dateRow = [];
        for ($i = 0; $i < $columns['mid_count']; $i++) {
            $dateRow[] = ['col' => $columns['mid_start'] + $i, 'value' => isset($attendanceTerms['midterm'][$i]) ? $this->formatAttendanceDate($attendanceTerms['midterm'][$i]) : '', 'style' => 9];
        }
        for ($i = 0; $i < $columns['final_count']; $i++) {
            $dateRow[] = ['col' => $columns['final_start'] + $i, 'value' => isset($attendanceTerms['final'][$i]) ? $this->formatAttendanceDate($attendanceTerms['final'][$i]) : '', 'style' => 9];
        }
        $rows[] = $this->xlsxRow($startRow + 1, $dateRow, 24);

        for ($index = 0; $index < $displayRows; $index++) {
            $student = $students[$index] ?? null;
            $rowNumber = $startRow + 2 + $index;
            $cells = [
                ['col' => 1, 'value' => $index + 1, 'type' => 'number', 'style' => 12],
                ['col' => 2, 'value' => $student ? ($student['full_name'] ?? '') : '', 'style' => 11],
                ['col' => 3, 'value' => '', 'style' => 11],
            ];
            $merges[] = 'B' . $rowNumber . ':C' . $rowNumber;

            for ($i = 0; $i < $columns['mid_count']; $i++) {
                $date = $attendanceTerms['midterm'][$i] ?? null;
                $cells[] = ['col' => $columns['mid_start'] + $i, 'value' => $this->attendanceMark($student, $data, $date), 'style' => 11];
            }
            $midSummary = $student ? $this->attendanceSummaryForDates($student, $data, $attendanceTerms['midterm']) : null;
            $cells[] = $this->xlsxNumberCell($columns['mid_total'], $midSummary['points'] ?? null, 13);

            for ($i = 0; $i < $columns['final_count']; $i++) {
                $date = $attendanceTerms['final'][$i] ?? null;
                $cells[] = ['col' => $columns['final_start'] + $i, 'value' => $this->attendanceMark($student, $data, $date), 'style' => 11];
            }
            $finalSummary = $student ? $this->attendanceSummaryForDates($student, $data, $attendanceTerms['final']) : null;
            $cells[] = $this->xlsxNumberCell($columns['final_total'], $finalSummary['points'] ?? null, 13);

            $rows[] = $this->xlsxRow($rowNumber, $cells, 17.25);
        }
    }

    private function attendanceMark($student, $data, $date) {
        if (!$student || !$date) return '';
        $attendance = $data['attendance'][$student['enrollment_id']][$date] ?? null;
        if (!$attendance) return '';
        return ($attendance['status'] ?? '') === 'present' ? 'P' : 'A';
    }

    private function classRecordColumnWidths($lastColumnIndex, $columns, $attendanceColumns) {
        $wideColumns = [
            2 => 36.29,
            3 => 13.14,
            $columns['midterm_average'] => 9.14,
            $columns['midterm_grade'] => 8.57,
            $columns['final_average'] => 9.14,
            $columns['midterm_contribution'] => 8,
            $columns['final_contribution'] => 8,
            $columns['final_grade'] => 8,
            $columns['final_rating'] => 8,
            $columns['remarks'] => 13,
        ];
        $mediumColumns = [
            $columns['mid_quiz_total'],
            $columns['mid_quiz_weighted'],
            $columns['mid_project_total'],
            $columns['mid_project_weighted'],
            $columns['mid_exam_score'],
            $columns['mid_exam_weighted'],
            $columns['final_quiz_total'],
            $columns['final_quiz_weighted'],
            $columns['final_project_total'],
            $columns['final_project_weighted'],
            $columns['final_exam_score'],
            $columns['final_exam_weighted'],
            $attendanceColumns['mid_total'],
            $attendanceColumns['final_total'],
        ];

        $xml = '';
        for ($i = 1; $i <= $lastColumnIndex; $i++) {
            if ($i === 1) {
                $width = 4.43;
            } elseif (isset($wideColumns[$i])) {
                $width = $wideColumns[$i];
            } elseif (in_array($i, $mediumColumns, true)) {
                $width = 7.57;
            } else {
                $width = 5.57;
            }
            $xml .= '<col min="' . $i . '" max="' . $i . '" width="' . $width . '" customWidth="1"/>';
        }

        return $xml;
    }

    private function remarksStyle($remarks) {
        if (strcasecmp((string)$remarks, 'Passed') === 0) return 17;
        if (strcasecmp((string)$remarks, 'Failed') === 0) return 18;
        return 11;
    }

    private function formatSemesterLabel($semester) {
        $value = strtolower(trim((string)$semester));
        if (in_array($value, ['1st', 'first', 'first semester'], true)) return 'First Semester';
        if (in_array($value, ['2nd', 'second', 'second semester'], true)) return 'Second Semester';
        if ($value === 'summer') return 'Summer';
        return (string)$semester;
    }

    private function formatAttendanceDate($date) {
        $timestamp = strtotime((string)$date);
        return $timestamp ? date('m/d', $timestamp) : (string)$date;
    }

    private function columnName($index) {
        $name = '';
        while ($index > 0) {
            $index--;
            $name = chr(65 + ($index % 26)) . $name;
            $index = intdiv($index, 26);
        }
        return $name;
    }

    private function xlsxContentTypes() {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
            . '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            . '</Types>';
    }

    private function xlsxRootRels() {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
            . '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
            . '</Relationships>';
    }

    private function xlsxWorkbook() {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<sheets><sheet name="Class Record" sheetId="1" r:id="rId1"/></sheets>'
            . '</workbook>';
    }

    private function xlsxWorkbookRels() {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            . '</Relationships>';
    }

    private function xlsxStyles() {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<fonts count="7">'
            . '<font><sz val="11"/><name val="Calibri"/></font>'
            . '<font><sz val="11"/><name val="Calibri"/></font>'
            . '<font><b/><sz val="11"/><name val="Calibri"/></font>'
            . '<font><i/><sz val="11"/><name val="Calibri"/></font>'
            . '<font><b/><sz val="8"/><name val="Calibri"/></font>'
            . '<font><sz val="8"/><name val="Calibri"/></font>'
            . '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
            . '</fonts>'
            . '<fills count="8">'
            . '<fill><patternFill patternType="none"/></fill>'
            . '<fill><patternFill patternType="gray125"/></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FF00B050"/><bgColor indexed="64"/></patternFill></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FFB8CCE4"/><bgColor indexed="64"/></patternFill></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FFE2F0D9"/><bgColor indexed="64"/></patternFill></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FFF4CCCC"/><bgColor indexed="64"/></patternFill></fill>'
            . '</fills>'
            . '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border></borders>'
            . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            . '<cellXfs count="19">'
            . '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            . '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
            . '<xf numFmtId="0" fontId="6" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="2" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
            . '<xf numFmtId="0" fontId="4" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
            . '<xf numFmtId="0" fontId="2" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
            . '<xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="9" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="2" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="2" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="2" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '</cellXfs>'
            . '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>'
            . '</styleSheet>';
    }

    private function xlsxAppProps() {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>COEDIGO</Application></Properties>';
    }

    private function xlsxCoreProps() {
        $created = gmdate('Y-m-d\TH:i:s\Z');
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            . '<dc:creator>COEDIGO</dc:creator><dc:title>Class Record</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">' . $created . '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' . $created . '</dcterms:modified>'
            . '</cp:coreProperties>';
    }

    private function assessmentKey($category, $name) {
        return $category . ':' . strtolower(trim(preg_replace('/\s+/', ' ', (string)$name)));
    }

    private function buildExportFilename($classData) {
        $base = implode('-', array_filter([
            $classData['subject_code'] ?? 'class',
            $classData['section'] ?? null,
            'class-record',
        ]));
        $safe = preg_replace('/[^A-Za-z0-9._-]+/', '-', $base);
        return trim($safe, '-') . '.xlsx';
    }

    private function formatNumber($value) {
        if ($value === null || $value === '') return '';
        $number = (float)$value;
        return rtrim(rtrim(number_format($number, 2, '.', ''), '0'), '.');
    }

    private function xmlEscape($value) {
        return htmlspecialchars($value, ENT_XML1 | ENT_COMPAT, 'UTF-8');
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
}
