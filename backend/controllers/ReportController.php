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

        return [
            'class' => $classData,
            'students' => $studentRows,
            'assessments' => $assessments,
            'scores' => $scoreMap,
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
        $rows = [];
        $rowNumber = 1;
        $totalColumns = 12 + count($data['assessments']);
        $lastColumn = $this->columnName($totalColumns);

        $rows[] = $this->xlsxRow($rowNumber++, [
            ['value' => 'C.O.E.D.I.G.O. Class Record', 'style' => 1],
        ]);
        $rows[] = $this->xlsxRow($rowNumber++, [
            ['value' => 'Subject', 'style' => 3],
            ['value' => "{$class['subject_code']} - {$class['subject_name']}"],
        ]);
        $rows[] = $this->xlsxRow($rowNumber++, [
            ['value' => 'Section', 'style' => 3],
            ['value' => $class['section']],
            ['value' => 'Semester', 'style' => 3],
            ['value' => $class['semester']],
            ['value' => 'Academic Year', 'style' => 3],
            ['value' => $class['academic_year']],
        ]);
        $rows[] = $this->xlsxRow($rowNumber++, [
            ['value' => 'Faculty', 'style' => 3],
            ['value' => $class['faculty_name']],
            ['value' => 'Generated', 'style' => 3],
            ['value' => date('Y-m-d H:i')],
        ]);
        $rows[] = $this->xlsxRow($rowNumber++, []);

        $headerCells = [
            ['value' => '#', 'style' => 2],
            ['value' => 'Student No.', 'style' => 2],
            ['value' => 'Student Name', 'style' => 2],
            ['value' => 'Program', 'style' => 2],
            ['value' => 'Year', 'style' => 2],
        ];

        foreach ($data['assessments'] as $assessment) {
            $headerCells[] = [
                'value' => $assessment['name'] . ' / ' . $this->formatNumber($assessment['max_score']),
                'style' => 2,
            ];
        }

        $headerCells = array_merge($headerCells, [
            ['value' => 'Attendance', 'style' => 2],
            ['value' => 'Major Exam Avg', 'style' => 2],
            ['value' => 'Quiz Avg', 'style' => 2],
            ['value' => 'Project Avg', 'style' => 2],
            ['value' => 'Weighted Score', 'style' => 2],
            ['value' => 'Final Grade', 'style' => 2],
            ['value' => 'Remarks', 'style' => 2],
        ]);
        $rows[] = $this->xlsxRow($rowNumber++, $headerCells);

        $index = 1;
        foreach ($data['students'] as $student) {
            $cells = [
                ['value' => $index++, 'type' => 'number'],
                ['value' => $student['student_number']],
                ['value' => $student['full_name']],
                ['value' => $student['program']],
                ['value' => $student['year_level'], 'type' => 'number'],
            ];

            foreach ($data['assessments'] as $assessment) {
                $score = $data['scores'][$student['enrollment_id']][$assessment['key']] ?? null;
                $cells[] = ['value' => $score, 'type' => is_numeric($score) ? 'number' : 'string'];
            }

            $attendancePossible = (float)($student['attendance_possible'] ?? 0);
            $attendance = $attendancePossible > 0
                ? $this->formatNumber($student['attendance_points']) . '/' . $this->formatNumber($attendancePossible)
                : '';

            $cells = array_merge($cells, [
                ['value' => $attendance],
                ['value' => $student['major_exam_avg'], 'type' => is_numeric($student['major_exam_avg']) ? 'number' : 'string'],
                ['value' => $student['quiz_avg'], 'type' => is_numeric($student['quiz_avg']) ? 'number' : 'string'],
                ['value' => $student['project_avg'], 'type' => is_numeric($student['project_avg']) ? 'number' : 'string'],
                ['value' => $student['weighted_score'], 'type' => is_numeric($student['weighted_score']) ? 'number' : 'string'],
                ['value' => $student['final_grade'], 'type' => is_numeric($student['final_grade']) ? 'number' : 'string'],
                ['value' => $student['remarks']],
            ]);

            $rows[] = $this->xlsxRow($rowNumber++, $cells);
        }

        if (empty($data['students'])) {
            $rows[] = $this->xlsxRow($rowNumber++, [
                ['value' => 'No students enrolled', 'style' => 3],
            ]);
        }

        $columnWidths = '';
        for ($i = 1; $i <= $totalColumns; $i++) {
            $width = $i === 3 ? 28 : ($i > 5 && $i <= 5 + count($data['assessments']) ? 15 : 14);
            $columnWidths .= '<col min="' . $i . '" max="' . $i . '" width="' . $width . '" customWidth="1"/>';
        }

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<sheetViews><sheetView workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            . '<cols>' . $columnWidths . '</cols>'
            . '<sheetData>' . implode('', $rows) . '</sheetData>'
            . '<mergeCells count="1"><mergeCell ref="A1:' . $lastColumn . '1"/></mergeCells>'
            . '</worksheet>';
    }

    private function xlsxRow($rowNumber, $cells) {
        $xml = '<row r="' . $rowNumber . '">';
        foreach ($cells as $index => $cell) {
            $xml .= $this->xlsxCell($rowNumber, $index + 1, $cell);
        }
        return $xml . '</row>';
    }

    private function xlsxCell($rowNumber, $columnIndex, $cell) {
        $value = $cell['value'] ?? '';
        if ($value === null) $value = '';
        $style = isset($cell['style']) ? ' s="' . (int)$cell['style'] . '"' : '';
        $reference = $this->columnName($columnIndex) . $rowNumber;
        $type = $cell['type'] ?? 'string';

        if ($type === 'number' && is_numeric($value)) {
            return '<c r="' . $reference . '"' . $style . '><v>' . $this->xmlEscape((string)$value) . '</v></c>';
        }

        return '<c r="' . $reference . '" t="inlineStr"' . $style . '><is><t>' . $this->xmlEscape((string)$value) . '</t></is></c>';
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
            . '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font></fonts>'
            . '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD4650B"/><bgColor indexed="64"/></patternFill></fill></fills>'
            . '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders>'
            . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            . '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
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
