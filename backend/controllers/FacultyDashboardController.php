<?php
/**
 * C.O.E.D.I.G.O. - Faculty Dashboard Controller
 * Aggregates faculty class, grade, and attendance risk signals.
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../utils/Response.php';

class FacultyDashboardController {
    private $db;
    private const LOW_SCORE_LINE = 75.0;
    private const ABSENCE_TRIGGER = 3;

    public function __construct() {
        $database = new Database();
        $this->db = $database->getConnection();
        $this->ensureAttendanceTable();
    }

    public function index() {
        $auth = AuthMiddleware::authorize(['faculty']);

        try {
            $profile = $this->getProfile($auth['sub']);
            $classes = $this->getFacultyClasses($auth['sub']);
            $classIds = array_map(function($class) {
                return (int)$class['id'];
            }, $classes);

            $students = $this->getFacultyStudents($classIds);
            $enrollmentIds = array_column($students, 'enrollment_id');
            $attendanceMap = $this->getAttendanceMap($enrollmentIds);
            $componentMap = $this->getComponentMap($enrollmentIds);
            $gradingWeights = $this->getGradingWeights();
            $students = $this->attachStudentSignals($students, $attendanceMap, $componentMap, $gradingWeights);
            $classes = $this->attachClassSignals($classes, $students);
            $summary = $this->buildSummary($classes, $students);

            Response::success([
                'profile' => $profile,
                'summary' => $summary,
                'classes' => $classes,
                'performance_curve' => $this->buildPerformanceCurve($classes),
                'student_phases' => $this->buildStudentPhases($students),
                'subject_risks' => $this->buildSubjectRisks($classes),
                'low_performance_watchlist' => $this->buildLowPerformanceWatchlist($students, $classes),
                'absence_watchlist' => $this->buildAbsenceWatchlist($students, $classes),
            ]);
        } catch (Exception $e) {
            error_log('Faculty dashboard error: ' . $e->getMessage());
            Response::error('Unable to load faculty dashboard.', 500);
        }
    }

    public function sendAbsenceWarning() {
        $auth = AuthMiddleware::authorize(['faculty']);
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $enrollmentId = (int)($data['enrollment_id'] ?? 0);

        if ($enrollmentId <= 0) {
            Response::error('Enrollment is required.', 422);
        }

        $stmt = $this->db->prepare("
            SELECT
                e.id AS enrollment_id,
                e.student_id,
                cr.id AS class_id,
                cr.section,
                s.code AS subject_code,
                s.name AS subject_name,
                u.first_name,
                u.last_name
            FROM enrollments e
            INNER JOIN class_records cr ON cr.id = e.class_record_id
            INNER JOIN subjects s ON s.id = cr.subject_id
            INNER JOIN users u ON u.id = e.student_id
            WHERE e.id = ?
              AND cr.faculty_id = ?
              AND e.is_active = 1
              AND cr.is_active = 1
            LIMIT 1
        ");
        $stmt->execute([$enrollmentId, $auth['sub']]);
        $target = $stmt->fetch();

        if (!$target) {
            Response::error('Student enrollment was not found for this faculty account.', 404);
        }

        $dates = $data['dates'] ?? [];
        if (!is_array($dates)) {
            $dates = [];
        }

        $dateText = count($dates) ? ' Dates: ' . implode(', ', array_slice($dates, -4)) . '.' : '';
        $studentName = trim(($target['first_name'] ?? '') . ' ' . ($target['last_name'] ?? ''));
        $message = "Attendance warning for {$target['subject_code']} {$target['section']}: you reached the " . self::ABSENCE_TRIGGER . "-consecutive-absence trigger.{$dateText} Please coordinate with your instructor.";

        $notification = $this->db->prepare("
            INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id)
            VALUES (?, ?, ?, 'system', 'class_record', ?)
        ");
        $notification->execute([
            $target['student_id'],
            'Attendance Warning',
            $message,
            $target['class_id'],
        ]);

        Response::success([
            'student_id' => (int)$target['student_id'],
            'student_name' => $studentName,
            'class_id' => (int)$target['class_id'],
        ], 'Absence warning sent.');
    }

    private function getProfile($facultyId) {
        $stmt = $this->db->prepare("
            SELECT id, first_name, last_name, email, department, program
            FROM users
            WHERE id = ?
            LIMIT 1
        ");
        $stmt->execute([$facultyId]);
        return $stmt->fetch() ?: [];
    }

    private function getFacultyClasses($facultyId) {
        $stmt = $this->db->prepare("
            SELECT
                cr.id,
                cr.section,
                cr.academic_year,
                cr.semester,
                cr.schedule,
                cr.room,
                cr.max_students,
                cr.attendance_weight,
                cr.grade_status,
                cr.verified_at,
                cr.released_at,
                cr.created_at,
                cr.updated_at,
                s.code AS subject_code,
                s.name AS subject_name,
                s.units,
                s.description AS subject_description,
                (
                    SELECT COUNT(*)
                    FROM enrollments e
                    WHERE e.class_record_id = cr.id
                      AND e.is_active = 1
                ) AS student_count
            FROM class_records cr
            INNER JOIN subjects s ON s.id = cr.subject_id
            WHERE cr.faculty_id = ?
              AND cr.is_active = 1
            ORDER BY cr.academic_year DESC, cr.semester DESC, s.code ASC
        ");
        $stmt->execute([$facultyId]);
        return $stmt->fetchAll();
    }

    private function getFacultyStudents($classIds) {
        if (empty($classIds)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($classIds), '?'));
        $stmt = $this->db->prepare("
            SELECT
                e.id AS enrollment_id,
                e.class_record_id,
                u.id AS student_id,
                u.student_id AS student_number,
                u.first_name,
                u.middle_name,
                u.last_name,
                u.program,
                u.year_level,
                cr.attendance_weight,
                g.major_exam_avg,
                g.quiz_avg,
                g.project_avg,
                g.weighted_score,
                g.final_grade,
                g.remarks,
                g.computed_at
            FROM enrollments e
            INNER JOIN class_records cr ON cr.id = e.class_record_id
            INNER JOIN users u ON u.id = e.student_id
            LEFT JOIN grades g ON g.enrollment_id = e.id
            WHERE e.class_record_id IN ($placeholders)
              AND e.is_active = 1
            ORDER BY u.last_name ASC, u.first_name ASC
        ");
        $stmt->execute($classIds);
        return $stmt->fetchAll();
    }

    private function getAttendanceMap($enrollmentIds) {
        $enrollmentIds = array_values(array_filter(array_map('intval', $enrollmentIds)));
        if (empty($enrollmentIds)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($enrollmentIds), '?'));
        $stmt = $this->db->prepare("
            SELECT enrollment_id, attendance_date, status, points
            FROM attendance_records
            WHERE enrollment_id IN ($placeholders)
            ORDER BY attendance_date ASC
        ");
        $stmt->execute($enrollmentIds);

        $map = [];
        foreach ($stmt->fetchAll() as $row) {
            $key = (int)$row['enrollment_id'];
            if (!isset($map[$key])) {
                $map[$key] = [];
            }
            $map[$key][] = $row;
        }

        return $map;
    }

    private function getComponentMap($enrollmentIds) {
        $enrollmentIds = array_values(array_filter(array_map('intval', $enrollmentIds)));
        if (empty($enrollmentIds)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($enrollmentIds), '?'));
        $stmt = $this->db->prepare("
            SELECT enrollment_id, category, component_name, max_score, score
            FROM grade_components
            WHERE enrollment_id IN ($placeholders)
              AND score IS NOT NULL
              AND LOWER(component_name) <> 'attendance'
            ORDER BY enrollment_id, category, component_name
        ");
        $stmt->execute($enrollmentIds);

        $map = [];
        foreach ($stmt->fetchAll() as $row) {
            $key = (int)$row['enrollment_id'];
            if (!isset($map[$key])) {
                $map[$key] = [];
            }
            $map[$key][] = $row;
        }

        return $map;
    }

    private function getGradingWeights() {
        $settings = $this->db->query("
            SELECT setting_key, setting_value
            FROM system_settings
            WHERE setting_key IN ('major_exam_weight','quiz_weight','project_weight')
        ")->fetchAll(PDO::FETCH_KEY_PAIR);

        return [
            'exam' => ((float)($settings['major_exam_weight'] ?? 30)) / 100,
            'quiz' => ((float)($settings['quiz_weight'] ?? 30)) / 100,
            'project' => ((float)($settings['project_weight'] ?? 40)) / 100,
        ];
    }

    private function attachStudentSignals($students, $attendanceMap, $componentMap, $gradingWeights) {
        foreach ($students as &$student) {
            $enrollmentId = (int)$student['enrollment_id'];
            $attendanceRows = $attendanceMap[$enrollmentId] ?? [];
            $componentRows = $componentMap[$enrollmentId] ?? [];
            $terms = $this->organizeComponentsByTerm($componentRows);
            $attendanceTerms = $this->splitAttendanceRowsByTerm($attendanceRows);
            $attendanceWeight = min(
                max(0, (float)($student['attendance_weight'] ?? 0)) / 100,
                max(0, $gradingWeights['project'])
            );
            $midterm = $this->calculateTermStats($terms['midterm'], $attendanceTerms['midterm'], $gradingWeights, $attendanceWeight);
            $final = $this->calculateTermStats($terms['final'], $attendanceTerms['final'], $gradingWeights, $attendanceWeight);
            $hasMidterm = $this->termHasScoredComponents($terms['midterm']);
            $hasFinal = $this->termHasScoredComponents($terms['final']);
            $midtermScore = $hasMidterm ? $midterm['weighted_score'] : null;
            $finalScore = $hasFinal ? $final['weighted_score'] : null;
            $subjectScore = ($hasMidterm && $hasFinal)
                ? (($midtermScore ?? 0) * 0.5) + (($finalScore ?? 0) * 0.5)
                : null;
            $currentScore = $subjectScore ?? $finalScore ?? $midtermScore;
            $absence = $this->longestAbsenceStreak($attendanceRows);
            $lowReasons = $this->buildLowPerformanceReasons($midtermScore, $finalScore, $subjectScore);

            $student['full_name'] = trim(($student['first_name'] ?? '') . ' ' . ($student['last_name'] ?? ''));
            $student['weighted_score'] = $currentScore;
            $student['current_performance_score'] = $currentScore;
            $student['midterm_score'] = $midtermScore !== null ? round($midtermScore, 1) : null;
            $student['final_score'] = $finalScore !== null ? round($finalScore, 1) : null;
            $student['subject_score'] = $subjectScore !== null ? round($subjectScore, 1) : null;
            $student['has_midterm_scores'] = $hasMidterm;
            $student['has_final_scores'] = $hasFinal;
            $student['low_performance_reasons'] = $lowReasons;
            $student['performance_status'] = $this->performanceStatus($lowReasons);
            $student['consecutive_absences'] = $absence['count'];
            $student['absence_dates'] = $absence['dates'];

            if ($absence['count'] >= self::ABSENCE_TRIGGER) {
                $student['risk_status'] = 'absence';
            } elseif (!empty($lowReasons)) {
                $student['risk_status'] = 'low';
            } else {
                $student['risk_status'] = 'on_track';
            }
        }
        unset($student);

        return $students;
    }

    private function buildLowPerformanceReasons($midtermScore, $finalScore, $subjectScore) {
        $reasons = [];
        if ($midtermScore !== null && $midtermScore < self::LOW_SCORE_LINE) {
            $reasons[] = [
                'type' => 'midterm',
                'label' => 'Midterm below target',
                'score' => round($midtermScore, 1),
            ];
        }
        if ($finalScore !== null && $finalScore < self::LOW_SCORE_LINE) {
            $reasons[] = [
                'type' => 'final',
                'label' => 'Final below target',
                'score' => round($finalScore, 1),
            ];
        }
        if ($subjectScore !== null && $subjectScore < self::LOW_SCORE_LINE) {
            $reasons[] = [
                'type' => 'subject',
                'label' => 'Subject below target',
                'score' => round($subjectScore, 1),
            ];
        }
        return $reasons;
    }

    private function performanceStatus($reasons) {
        foreach ($reasons as $reason) {
            if (($reason['type'] ?? '') === 'subject') {
                return 'subject_below_target';
            }
        }
        foreach ($reasons as $reason) {
            if (($reason['type'] ?? '') === 'final') {
                return 'final_below_target';
            }
        }
        foreach ($reasons as $reason) {
            if (($reason['type'] ?? '') === 'midterm') {
                return 'midterm_below_target';
            }
        }
        return 'on_track';
    }

    private function attachClassSignals($classes, $students) {
        $metrics = [];
        foreach ($classes as $class) {
            $metrics[(int)$class['id']] = [
                'score_total' => 0.0,
                'score_count' => 0,
                'low_count' => 0,
                'midterm_below_count' => 0,
                'final_below_count' => 0,
                'subject_below_count' => 0,
                'absence_alert_count' => 0,
            ];
        }

        foreach ($students as $student) {
            $classId = (int)$student['class_record_id'];
            if (!isset($metrics[$classId])) {
                continue;
            }

            if ($student['current_performance_score'] !== null) {
                $metrics[$classId]['score_total'] += (float)$student['current_performance_score'];
                $metrics[$classId]['score_count']++;
            }

            if (!empty($student['low_performance_reasons'])) {
                $metrics[$classId]['low_count']++;
                foreach ($student['low_performance_reasons'] as $reason) {
                    if (($reason['type'] ?? '') === 'midterm') {
                        $metrics[$classId]['midterm_below_count']++;
                    } elseif (($reason['type'] ?? '') === 'final') {
                        $metrics[$classId]['final_below_count']++;
                    } elseif (($reason['type'] ?? '') === 'subject') {
                        $metrics[$classId]['subject_below_count']++;
                    }
                }
            }
            if (($student['risk_status'] ?? '') === 'absence') {
                $metrics[$classId]['absence_alert_count']++;
            }
        }

        foreach ($classes as &$class) {
            $classId = (int)$class['id'];
            $metric = $metrics[$classId] ?? [
                'score_total' => 0.0,
                'score_count' => 0,
                'low_count' => 0,
                'midterm_below_count' => 0,
                'final_below_count' => 0,
                'subject_below_count' => 0,
                'absence_alert_count' => 0,
            ];

            $class['id'] = $classId;
            $class['student_count'] = (int)($class['student_count'] ?? 0);
            $class['max_students'] = (int)($class['max_students'] ?? 50);
            $class['low_count'] = (int)$metric['low_count'];
            $class['midterm_below_count'] = (int)$metric['midterm_below_count'];
            $class['final_below_count'] = (int)$metric['final_below_count'];
            $class['subject_below_count'] = (int)$metric['subject_below_count'];
            $class['absence_alert_count'] = (int)$metric['absence_alert_count'];
            $class['average_score'] = $metric['score_count'] > 0
                ? round($metric['score_total'] / $metric['score_count'], 1)
                : null;
            $class['risk_count'] = $class['low_count'] + $class['absence_alert_count'];
        }
        unset($class);

        return $classes;
    }

    private function buildSummary($classes, $students) {
        $totalStudents = count($students);
        $totalCapacity = 0;
        $scoreTotal = 0.0;
        $scoreCount = 0;
        $draft = 0;
        $verified = 0;
        $released = 0;
        $low = 0;
        $midtermBelow = 0;
        $finalBelow = 0;
        $subjectBelow = 0;
        $absence = 0;

        foreach ($classes as $class) {
            $totalCapacity += max(0, (int)($class['max_students'] ?? 0));
            if (($class['grade_status'] ?? '') === 'draft') {
                $draft++;
            } elseif (($class['grade_status'] ?? '') === 'faculty_verified') {
                $verified++;
            } elseif (($class['grade_status'] ?? '') === 'officially_released') {
                $released++;
            }
        }

        foreach ($students as $student) {
            if ($student['current_performance_score'] !== null) {
                $scoreTotal += (float)$student['current_performance_score'];
                $scoreCount++;
            }

            if (!empty($student['low_performance_reasons'])) {
                $low++;
                foreach ($student['low_performance_reasons'] as $reason) {
                    if (($reason['type'] ?? '') === 'midterm') {
                        $midtermBelow++;
                    } elseif (($reason['type'] ?? '') === 'final') {
                        $finalBelow++;
                    } elseif (($reason['type'] ?? '') === 'subject') {
                        $subjectBelow++;
                    }
                }
            }

            if (($student['consecutive_absences'] ?? 0) >= self::ABSENCE_TRIGGER) {
                $absence++;
            }
        }

        return [
            'total_classes' => count($classes),
            'total_students' => $totalStudents,
            'draft_records' => $draft,
            'verified_records' => $verified,
            'released_records' => $released,
            'low_performance_students' => $low,
            'midterm_below_target' => $midtermBelow,
            'final_below_target' => $finalBelow,
            'subject_below_target' => $subjectBelow,
            'absence_alerts' => $absence,
            'capacity_percent' => $totalCapacity > 0 ? round(($totalStudents / $totalCapacity) * 100, 1) : 0,
            'average_score' => $scoreCount > 0 ? round($scoreTotal / $scoreCount, 1) : 0,
            'low_score_line' => self::LOW_SCORE_LINE,
            'absence_trigger' => self::ABSENCE_TRIGGER,
        ];
    }

    private function buildPerformanceCurve($classes) {
        return array_map(function($class) {
            return [
                'class_id' => (int)$class['id'],
                'subject_code' => $class['subject_code'],
                'average_score' => $class['average_score'] !== null ? (float)$class['average_score'] : 0,
            ];
        }, $classes);
    }

    private function buildStudentPhases($students) {
        $phases = [
            'on_track' => 0,
            'low' => 0,
            'absence' => 0,
        ];

        foreach ($students as $student) {
            $status = $student['risk_status'] ?? 'on_track';
            if (!isset($phases[$status])) {
                $status = 'on_track';
            }
            $phases[$status]++;
        }

        return $phases;
    }

    private function buildSubjectRisks($classes) {
        usort($classes, function($a, $b) {
            $riskCompare = ((int)($b['risk_count'] ?? 0)) <=> ((int)($a['risk_count'] ?? 0));
            if ($riskCompare !== 0) {
                return $riskCompare;
            }
            return (float)($a['average_score'] ?? 100) <=> (float)($b['average_score'] ?? 100);
        });

        return array_values(array_slice($classes, 0, 6));
    }

    private function buildLowPerformanceWatchlist($students, $classes) {
        $classMap = [];
        foreach ($classes as $class) {
            $classMap[(int)$class['id']] = $class;
        }

        $watchlist = [];
        foreach ($students as $student) {
            if (empty($student['low_performance_reasons'])) {
                continue;
            }

            $class = $classMap[(int)$student['class_record_id']] ?? [];
            $watchlist[] = [
                'enrollment_id' => (int)$student['enrollment_id'],
                'student_id' => (int)$student['student_id'],
                'student_number' => $student['student_number'],
                'full_name' => $student['full_name'],
                'program' => $student['program'],
                'year_level' => $student['year_level'],
                'class_id' => (int)$student['class_record_id'],
                'subject_code' => $class['subject_code'] ?? '',
                'subject_name' => $class['subject_name'] ?? '',
                'section' => $class['section'] ?? '',
                'midterm_score' => $student['midterm_score'],
                'final_score' => $student['final_score'],
                'subject_score' => $student['subject_score'],
                'current_performance_score' => $student['current_performance_score'] !== null ? round($student['current_performance_score'], 1) : null,
                'has_midterm_scores' => $student['has_midterm_scores'],
                'has_final_scores' => $student['has_final_scores'],
                'performance_status' => $student['performance_status'],
                'reasons' => $student['low_performance_reasons'],
            ];
        }

        usort($watchlist, function($a, $b) {
            $rank = [
                'subject_below_target' => 0,
                'final_below_target' => 1,
                'midterm_below_target' => 2,
            ];
            $rankA = $rank[$a['performance_status']] ?? 3;
            $rankB = $rank[$b['performance_status']] ?? 3;
            if ($rankA !== $rankB) {
                return $rankA <=> $rankB;
            }
            return (float)($a['current_performance_score'] ?? 999) <=> (float)($b['current_performance_score'] ?? 999);
        });

        return array_values($watchlist);
    }

    private function buildAbsenceWatchlist($students, $classes) {
        $classMap = [];
        foreach ($classes as $class) {
            $classMap[(int)$class['id']] = $class;
        }

        $watchlist = [];
        foreach ($students as $student) {
            if (($student['consecutive_absences'] ?? 0) < self::ABSENCE_TRIGGER) {
                continue;
            }

            $class = $classMap[(int)$student['class_record_id']] ?? [];
            $watchlist[] = [
                'enrollment_id' => (int)$student['enrollment_id'],
                'student_id' => (int)$student['student_id'],
                'student_number' => $student['student_number'],
                'first_name' => $student['first_name'],
                'last_name' => $student['last_name'],
                'full_name' => $student['full_name'],
                'program' => $student['program'],
                'year_level' => $student['year_level'],
                'class_id' => (int)$student['class_record_id'],
                'subject_code' => $class['subject_code'] ?? '',
                'subject_name' => $class['subject_name'] ?? '',
                'section' => $class['section'] ?? '',
                'consecutive_absences' => (int)$student['consecutive_absences'],
                'dates' => $student['absence_dates'],
            ];
        }

        usort($watchlist, function($a, $b) {
            return $b['consecutive_absences'] <=> $a['consecutive_absences'];
        });

        return array_values($watchlist);
    }

    private function longestAbsenceStreak($attendanceRows) {
        $bestCount = 0;
        $currentCount = 0;
        $bestDates = [];
        $currentDates = [];

        foreach ($attendanceRows as $row) {
            if (($row['status'] ?? '') === 'absent') {
                $currentCount++;
                $currentDates[] = $row['attendance_date'];

                if ($currentCount >= $bestCount) {
                    $bestCount = $currentCount;
                    $bestDates = $currentDates;
                }
            } else {
                $currentCount = 0;
                $currentDates = [];
            }
        }

        return [
            'count' => $bestCount,
            'dates' => array_slice($bestDates, -max(self::ABSENCE_TRIGGER, $bestCount)),
        ];
    }

    private function organizeComponentsByTerm($components) {
        $terms = [
            'midterm' => ['major_exam' => [], 'quiz' => [], 'project' => []],
            'final' => ['major_exam' => [], 'quiz' => [], 'project' => []],
        ];
        $categories = ['major_exam', 'quiz', 'project'];

        foreach ($categories as $category) {
            $categoryComponents = array_values(array_filter($components, function ($component) use ($category) {
                return ($component['category'] ?? '') === $category;
            }));
            $unassigned = [];
            $assignedCount = 0;

            foreach ($categoryComponents as $component) {
                $term = $this->detectAssessmentTerm($component['component_name'] ?? '');
                if ($term) {
                    $terms[$term][$category][] = $component;
                    $assignedCount++;
                } else {
                    $unassigned[] = $component;
                }
            }

            if (empty($unassigned)) {
                continue;
            }

            if ($assignedCount === 0) {
                $midtermCount = (int)ceil(count($unassigned) / 2);
                foreach ($unassigned as $index => $component) {
                    $terms[$index < $midtermCount ? 'midterm' : 'final'][$category][] = $component;
                }
                continue;
            }

            foreach ($unassigned as $component) {
                $terms['midterm'][$category][] = $component;
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

    private function splitAttendanceRowsByTerm($rows) {
        usort($rows, function ($a, $b) {
            return strcmp((string)($a['attendance_date'] ?? ''), (string)($b['attendance_date'] ?? ''));
        });
        $midtermCount = (int)ceil(count($rows) / 2);

        return [
            'midterm' => array_slice($rows, 0, $midtermCount),
            'final' => array_slice($rows, $midtermCount),
        ];
    }

    private function calculateTermStats($termComponents, $attendanceRows, $weights, $attendanceWeight = 0.05) {
        $examAvg = $this->transmutedAverage($termComponents['major_exam'] ?? []);
        $quizAvg = $this->transmutedAverage($termComponents['quiz'] ?? []);
        $projectAvg = $this->performanceTaskAverage($termComponents['project'] ?? []);
        $attendanceValue = $this->transmutedAttendanceValue($attendanceRows);
        $attendanceWeight = min(max(0, $attendanceWeight), max(0, $weights['project']));
        $performanceTaskWeight = max(0, $weights['project'] - $attendanceWeight);
        $hasScores = $examAvg !== null || $quizAvg !== null || $projectAvg !== null || $attendanceValue !== null;
        $weighted = $hasScores
            ? (($examAvg ?? 0) * $weights['exam'])
                + (($quizAvg ?? 0) * $weights['quiz'])
                + (($projectAvg ?? 0) * $performanceTaskWeight)
                + (($attendanceValue ?? 0) * $attendanceWeight)
            : null;

        return [
            'weighted_score' => $weighted,
            'has_scores' => $hasScores,
        ];
    }

    private function termHasScoredComponents($termComponents) {
        foreach (['major_exam', 'quiz', 'project'] as $category) {
            foreach ($termComponents[$category] ?? [] as $component) {
                if (is_numeric($component['score'] ?? null)) {
                    return true;
                }
            }
        }
        return false;
    }

    private function transmutedAverage($components) {
        return $this->averagePresentValues($this->transmutedValues($components));
    }

    private function performanceTaskAverage($components) {
        $values = [];
        $subtotalScore = 0.0;
        $subtotalMax = 0.0;

        foreach ($components as $component) {
            $maxScore = (float)($component['max_score'] ?? 0);
            if ($maxScore <= 0 || !is_numeric($component['score'] ?? null)) {
                continue;
            }

            $score = (float)$component['score'];
            if ($maxScore < 100) {
                $subtotalScore += $score;
                $subtotalMax += $maxScore;
                continue;
            }

            $values[] = ($score / $maxScore) * 100;
        }

        if ($subtotalMax > 0) {
            array_unshift($values, (($subtotalScore / $subtotalMax) * 50) + 50);
        }

        return $this->averagePresentValues($values);
    }

    private function transmutedValues($components) {
        $values = [];
        foreach ($components as $component) {
            $maxScore = (float)($component['max_score'] ?? 0);
            if ($maxScore > 0 && is_numeric($component['score'] ?? null)) {
                $values[] = (((float)$component['score'] / $maxScore) * 50) + 50;
            }
        }
        return $values;
    }

    private function transmutedAttendanceValue($rows) {
        if (empty($rows)) {
            return null;
        }

        $points = 0.0;
        foreach ($rows as $row) {
            $points += (float)($row['points'] ?? 0);
        }

        return (($points / count($rows)) * 50) + 50;
    }

    private function averagePresentValues($values) {
        $values = array_values(array_filter($values, function ($value) {
            return $value !== null && $value !== '' && is_numeric($value);
        }));

        if (empty($values)) {
            return null;
        }

        return array_sum(array_map('floatval', $values)) / count($values);
    }

    private function ensureAttendanceTable() {
        try {
            $this->db->exec("CREATE TABLE IF NOT EXISTS attendance_records (
                id INT AUTO_INCREMENT PRIMARY KEY,
                enrollment_id INT NOT NULL,
                attendance_date DATE NOT NULL,
                status ENUM('present','absent') NOT NULL DEFAULT 'absent',
                points DECIMAL(5,2) NOT NULL DEFAULT 0.00,
                encoded_by INT NOT NULL,
                encoded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_attendance_entry (enrollment_id, attendance_date),
                INDEX idx_attendance_enrollment (enrollment_id),
                INDEX idx_attendance_date (attendance_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        } catch (Exception $e) {
            error_log('Faculty dashboard attendance table check failed: ' . $e->getMessage());
        }
    }
}
