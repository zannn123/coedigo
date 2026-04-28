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
        $this->ensureClassRecordColumns();
        $this->ensureAttendanceTable();
        $this->ensureGradeAssessmentTable();
    }

    /** GET /api/grades/class/:classId - Get grade book for a class */
    public function getClassGrades($classId) {
        $auth = AuthMiddleware::authorize(['faculty', 'dean', 'program_chair', 'admin']);

        if ($auth['role'] === 'faculty') {
            $check = $this->db->prepare("SELECT id FROM class_records WHERE id = ? AND faculty_id = ?");
            $check->execute([$classId, $auth['sub']]);
            if (!$check->fetch()) Response::error('Unauthorized.', 403);
        }

        $classAssessments = $this->getClassAssessments($classId);

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
            if ($student['grade']) {
                $student['grade']['attendance_included'] = true;
            }

            $student['attendance'] = $this->getAttendanceRows($student['enrollment_id']);
            $student['attendance_summary'] = $this->buildAttendanceSummary($student['attendance']);
        }

        Response::success([
            'students' => $students,
            'assessments' => $classAssessments,
        ]);
    }

    /** PUT /api/grades/class/:classId/assessments - Save class assessment definitions */
    public function saveClassAssessments($classId) {
        $auth = AuthMiddleware::authorize(['faculty']);
        $data = json_decode(file_get_contents('php://input'), true);
        $assessments = $data['assessments'] ?? [];
        $deleteIds = $data['delete_ids'] ?? [];

        if (!is_array($assessments) || !is_array($deleteIds)) {
            Response::error('Assessment changes are required.', 400);
        }

        $check = $this->db->prepare("SELECT id FROM class_records WHERE id = ? AND faculty_id = ?");
        $check->execute([$classId, $auth['sub']]);
        if (!$check->fetch()) Response::error('Unauthorized.', 403);

        $this->db->beginTransaction();
        try {
            if (!empty($deleteIds)) {
                $deleteIds = array_values(array_filter($deleteIds, function($id) { return is_numeric($id); }));
                if (!empty($deleteIds)) {
                    $placeholders = implode(',', array_fill(0, count($deleteIds), '?'));
                    $this->db->prepare("DELETE FROM grade_assessments WHERE id IN ($placeholders) AND class_record_id = ?")
                        ->execute(array_merge($deleteIds, [$classId]));
                }
            }

            $saved = [];
            foreach ($assessments as $assessment) {
                $category = trim((string)($assessment['category'] ?? ''));
                $componentName = trim((string)($assessment['component_name'] ?? ''));
                $maxScore = $this->normalizeDecimal($assessment['max_score'] ?? 0, false) ?? 0.0;
                $clientKey = $assessment['client_key'] ?? null;

                if (!in_array($category, ['major_exam', 'quiz', 'project'], true)) {
                    throw new InvalidArgumentException('Assessment category is invalid.');
                }
                if ($componentName === '') {
                    throw new InvalidArgumentException('Every assessment needs a name.');
                }
                if ($maxScore <= 0) {
                    throw new InvalidArgumentException("Assessment '{$componentName}' needs a max score greater than 0.");
                }

                if (!empty($assessment['id'])) {
                    $existing = $this->db->prepare("SELECT id, category, component_name FROM grade_assessments WHERE id = ? AND class_record_id = ?");
                    $existing->execute([$assessment['id'], $classId]);
                    $old = $existing->fetch();
                    if (!$old) {
                        throw new RuntimeException('Assessment definition not found.');
                    }

                    $this->db->prepare("UPDATE grade_assessments SET category = ?, component_name = ?, max_score = ?, updated_at = NOW() WHERE id = ? AND class_record_id = ?")
                        ->execute([$category, $componentName, $maxScore, $assessment['id'], $classId]);

                    if ($old['category'] !== $category || trim((string)$old['component_name']) !== $componentName) {
                        $this->renameClassGradeComponents($classId, $old['category'], $old['component_name'], $category, $componentName, $maxScore);
                    } else {
                        $this->updateClassGradeComponentMaxScore($classId, $category, $componentName, $maxScore);
                    }

                    $saved[] = $this->formatAssessmentDefinition($assessment['id'], $category, $componentName, $maxScore, $clientKey);
                } else {
                    $existing = $this->db->prepare("SELECT id FROM grade_assessments WHERE class_record_id = ? AND category = ? AND component_name = ?");
                    $existing->execute([$classId, $category, $componentName]);
                    $existingId = $existing->fetchColumn();

                    if ($existingId) {
                        $this->db->prepare("UPDATE grade_assessments SET max_score = ?, updated_at = NOW() WHERE id = ?")
                            ->execute([$maxScore, $existingId]);
                        $saved[] = $this->formatAssessmentDefinition($existingId, $category, $componentName, $maxScore, $clientKey);
                    } else {
                        $stmt = $this->db->prepare("INSERT INTO grade_assessments (class_record_id, category, component_name, max_score, created_by) VALUES (?, ?, ?, ?, ?)");
                        $stmt->execute([$classId, $category, $componentName, $maxScore, $auth['sub']]);
                        $saved[] = $this->formatAssessmentDefinition($this->db->lastInsertId(), $category, $componentName, $maxScore, $clientKey);
                    }
                }
            }

            $this->db->commit();
            Response::success(['assessments' => $saved], 'Assessments saved.');
        } catch (InvalidArgumentException $e) {
            $this->db->rollBack();
            Response::error($e->getMessage(), 422);
        } catch (Exception $e) {
            $this->db->rollBack();
            error_log('Save assessments error: ' . $e->getMessage());
            Response::error('Failed to save assessments.', 500);
        }
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
            $changedComponents = [];

            if (!empty($deleteIds) && is_array($deleteIds)) {
                $deleteIds = array_values(array_filter($deleteIds, function($id) { return is_numeric($id); }));
                if (!empty($deleteIds)) {
                    $placeholders = implode(',', array_fill(0, count($deleteIds), '?'));
                    $delete = $this->db->prepare("DELETE FROM grade_components WHERE id IN ($placeholders) AND enrollment_id = ?");
                    $delete->execute(array_merge($deleteIds, [$enrollmentId]));
                    if ($delete->rowCount() > 0) {
                        $changed = true;
                        $changedComponents[] = "Some items removed";
                    }
                }
            }

            foreach ($components as $comp) {
                $category = trim((string)($comp['category'] ?? ''));
                $componentName = trim((string)($comp['component_name'] ?? ''));
                $maxScore = $this->normalizeDecimal($comp['max_score'] ?? 0, false) ?? 0.0;
                $score = $this->normalizeDecimal($comp['score'] ?? null);

                // Skip empty components (drafts without data)
                if ($componentName === '' || $category === '') {
                    continue;
                }

                // Only validate max score if there's actually a score being saved
                if ($score !== null && $maxScore <= 0) {
                    throw new InvalidArgumentException("Assessment '{$componentName}' must have a max score greater than 0 when saving scores.");
                }

                // Set default max score for new assessments without scores
                if ($maxScore <= 0) {
                    $maxScore = $category === 'quiz' ? 50.0 : 100.0;
                }

                $scoreText = $score !== null ? "{$score}/{$maxScore}" : "Pending";
                $this->ensureAssessmentDefinitionForEnrollment($enrollmentId, $category, $componentName, $maxScore, $auth['sub']);

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
                        $changedComponents[] = "{$componentName} ({$scoreText})";
                    }
                } else {
                    // Only create new component if it has a score or is being explicitly created
                    if ($score !== null || !empty($comp['force_create'])) {
                        $stmt = $this->db->prepare("INSERT INTO grade_components (enrollment_id, category, component_name, max_score, score, encoded_by) VALUES (?, ?, ?, ?, ?, ?)");
                        $stmt->execute([$enrollmentId, $category, $componentName, $maxScore, $score, $auth['sub']]);
                        $changed = true;
                        $changedComponents[] = "{$componentName} (New assessment)";
                    }
                }
            }

            $grade = $this->computeGradeInternal($enrollmentId, $auth['sub']);
            $statusReset = $changed ? $this->resetClassStatusToDraft($enrollmentId) : false;
            $savedComponents = $this->getGradeComponents($enrollmentId);

            if ($changed) {
                $this->logAudit($auth['sub'], 'ENCODE_SCORES', 'enrollment', $enrollmentId, null, ['changes' => $changedComponents]);
                $this->notifyScoreUpdate($enrollmentId, $changedComponents);
            }

            $this->db->commit();

            Response::success([
                'changed' => $changed,
                'status_reset' => $statusReset,
                'grade' => $grade,
                'components' => $savedComponents,
            ], $changed ? 'Scores saved. Final marks remain hidden until verification.' : 'No score changes detected.');
        } catch (InvalidArgumentException $e) {
            $this->db->rollBack();
            error_log('Validation error in encode scores: ' . $e->getMessage());
            Response::error($e->getMessage(), 422);
        } catch (Exception $e) {
            $this->db->rollBack();
            error_log('Encode scores error: ' . $e->getMessage());
            Response::error('Failed to encode scores: ' . $e->getMessage(), 500);
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

            if ($changed) {
                $this->logAudit($auth['sub'], 'SAVE_ATTENDANCE', 'enrollment', $enrollmentId);
            }

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

    /** POST /api/grades/attendance/class - Save one dated attendance sheet for a class */
    public function saveClassAttendance() {
        $auth = AuthMiddleware::authorize(['faculty']);
        $data = json_decode(file_get_contents('php://input'), true);

        $classId = $data['class_id'] ?? null;
        $date = trim($data['attendance_date'] ?? '');
        $rows = $data['attendance'] ?? [];

        if (!$classId || !$this->isValidDate($date) || !is_array($rows)) {
            Response::error('Class, attendance date, and attendance rows are required.', 400);
        }

        $check = $this->db->prepare("SELECT id FROM class_records WHERE id = ? AND faculty_id = ?");
        $check->execute([$classId, $auth['sub']]);
        if (!$check->fetch()) Response::error('Unauthorized.', 403);

        $enrollments = $this->db->prepare("SELECT id FROM enrollments WHERE class_record_id = ? AND is_active = 1");
        $enrollments->execute([$classId]);
        $validEnrollmentIds = array_map('intval', array_column($enrollments->fetchAll(), 'id'));
        $validEnrollmentSet = array_flip($validEnrollmentIds);

        $this->db->beginTransaction();
        try {
            $upsert = $this->db->prepare("
                INSERT INTO attendance_records (enrollment_id, attendance_date, status, points, encoded_by)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    points = VALUES(points),
                    encoded_by = VALUES(encoded_by),
                    updated_at = NOW()
            ");

            $saved = 0;
            foreach ($rows as $row) {
                $enrollmentId = (int)($row['enrollment_id'] ?? 0);
                $status = $row['status'] ?? 'absent';

                if (!isset($validEnrollmentSet[$enrollmentId])) {
                    continue;
                }
                if (!in_array($status, ['present', 'absent'], true)) {
                    throw new InvalidArgumentException('Attendance status must be present or absent.');
                }

                $points = $status === 'present' ? 1 : 0;
                $upsert->execute([$enrollmentId, $date, $status, $points, $auth['sub']]);
                $saved++;
            }

            foreach ($validEnrollmentIds as $enrollmentId) {
                $this->computeGradeInternal($enrollmentId, $auth['sub']);
            }

            if ($saved > 0) {
                $this->db->prepare("UPDATE class_records SET grade_status = 'draft', verified_at = NULL, released_at = NULL WHERE id = ?")->execute([$classId]);
                $this->logAudit($auth['sub'], 'SAVE_CLASS_ATTENDANCE', 'class_record', $classId, null, [
                    'attendance_date' => $date,
                    'saved_count' => $saved,
                ]);
            }

            $this->db->commit();
            Response::success([
                'saved' => $saved,
                'attendance_date' => $date,
            ], 'Class attendance saved.');
        } catch (InvalidArgumentException $e) {
            $this->db->rollBack();
            Response::error($e->getMessage(), 422);
        } catch (Exception $e) {
            $this->db->rollBack();
            error_log('Save class attendance error: ' . $e->getMessage());
            Response::error('Failed to save class attendance.', 500);
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
            $this->logAudit($auth['sub'], 'DELETE_GRADE_COMPONENT', 'grade_component', $id, ['component_id' => $id, 'enrollment_id' => $component['enrollment_id']]);
            $this->notifyScoreUpdate($component['enrollment_id'], ['A score component was removed']);
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
        // Get attendance weight for this class
        $classInfo = $this->db->prepare("
            SELECT cr.attendance_weight
            FROM enrollments e
            INNER JOIN class_records cr ON e.class_record_id = cr.id
            WHERE e.id = ?
        ");
        $classInfo->execute([$enrollmentId]);
        $classData = $classInfo->fetch();
        $attendanceWeight = $classData ? (float)($classData['attendance_weight'] ?? 100.0) : 100.0;
        $attendanceWeight = max(0, min(100, $attendanceWeight)) / 100; // Normalize to 0-1

        $this->syncAttendanceComponent($enrollmentId, $encodedBy, $attendanceWeight);

        $settings = $this->db->query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('major_exam_weight','quiz_weight','project_weight','passing_grade','grade_scale')")->fetchAll(PDO::FETCH_KEY_PAIR);
        $examWeight = ((float)($settings['major_exam_weight'] ?? 30)) / 100;
        $quizWeight = ((float)($settings['quiz_weight'] ?? 30)) / 100;
        $projWeight = ((float)($settings['project_weight'] ?? 40)) / 100;
        $passingGrade = (float)($settings['passing_grade'] ?? 3.00);
        $gradeScale = explode(',', $settings['grade_scale'] ?? '1.0,1.1,1.2,1.3,1.4,1.5,1.6,1.7,1.8,1.9,2.0,2.1,2.2,2.3,2.4,2.5,2.6,2.7,2.8,2.9,3.0,5.0');

        $stmt = $this->db->prepare("
            SELECT category, component_name, max_score, score
            FROM grade_components
            WHERE enrollment_id = ?
              AND score IS NOT NULL
              AND component_name != 'Attendance'
            ORDER BY category, component_name
        ");
        $stmt->execute([$enrollmentId]);
        $terms = $this->organizeComponentsByTerm($stmt->fetchAll());
        $attendanceTerms = $this->splitAttendanceRowsByTerm($this->getAttendanceRows($enrollmentId));

        $midterm = $this->calculateTermStats($terms['midterm'], $attendanceTerms['midterm'], $examWeight, $quizWeight, $projWeight, $attendanceWeight);
        $final = $this->calculateTermStats($terms['final'], $attendanceTerms['final'], $examWeight, $quizWeight, $projWeight, $attendanceWeight);
        $hasAny = $midterm['has_scores'] || $final['has_scores'];

        $examAvg = $this->averagePresentValues([$midterm['major_exam_avg'], $final['major_exam_avg']]) ?? 0;
        $quizAvg = $this->averagePresentValues([$midterm['quiz_avg'], $final['quiz_avg']]) ?? 0;
        $projAvg = $this->averagePresentValues([$midterm['project_avg'], $final['project_avg']]) ?? 0;
        $weighted = $hasAny ? (($midterm['weighted_score'] ?? 0) * 0.5) + (($final['weighted_score'] ?? 0) * 0.5) : 0;
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
            'remarks' => $remarks,
            'midterm_average' => $midterm['weighted_score'] !== null ? round($midterm['weighted_score'], 2) : null,
            'final_average' => $final['weighted_score'] !== null ? round($final['weighted_score'], 2) : null,
            'attendance_included' => $attendanceWeight > 0,
            'attendance_weight' => round($attendanceWeight * 100, 2)
        ];
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

    private function ensureGradeAssessmentTable() {
        $this->db->exec("CREATE TABLE IF NOT EXISTS grade_assessments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            class_record_id INT NOT NULL,
            category ENUM('major_exam', 'quiz', 'project') NOT NULL,
            component_name VARCHAR(100) NOT NULL,
            max_score DECIMAL(6,2) NOT NULL,
            created_by INT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (class_record_id) REFERENCES class_records(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
            UNIQUE KEY uk_class_assessment (class_record_id, category, component_name),
            INDEX idx_class_assessment_class (class_record_id)
        ) ENGINE=InnoDB");
    }

    private function getClassAssessments($classId) {
        $stmt = $this->db->prepare("SELECT id, category, component_name, max_score, created_at, updated_at FROM grade_assessments WHERE class_record_id = ? ORDER BY category, component_name");
        $stmt->execute([$classId]);
        return $stmt->fetchAll();
    }

    private function formatAssessmentDefinition($id, $category, $componentName, $maxScore, $clientKey = null) {
        return [
            'id' => (int)$id,
            'category' => $category,
            'component_name' => $componentName,
            'max_score' => (float)$maxScore,
            'client_key' => $clientKey,
        ];
    }

    private function ensureAssessmentDefinitionForEnrollment($enrollmentId, $category, $componentName, $maxScore, $createdBy) {
        $classId = $this->db->prepare("SELECT class_record_id FROM enrollments WHERE id = ?");
        $classId->execute([$enrollmentId]);
        $classRecordId = $classId->fetchColumn();
        if (!$classRecordId || $componentName === 'Attendance') return;

        $stmt = $this->db->prepare("
            INSERT INTO grade_assessments (class_record_id, category, component_name, max_score, created_by)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE max_score = VALUES(max_score), updated_at = NOW()
        ");
        $stmt->execute([$classRecordId, $category, $componentName, $maxScore, $createdBy]);
    }

    private function renameClassGradeComponents($classId, $oldCategory, $oldName, $newCategory, $newName, $maxScore) {
        $stmt = $this->db->prepare("
            UPDATE grade_components gc
            INNER JOIN enrollments e ON gc.enrollment_id = e.id
            SET gc.category = ?, gc.component_name = ?, gc.max_score = ?, gc.updated_at = NOW()
            WHERE e.class_record_id = ?
              AND gc.category = ?
              AND gc.component_name = ?
        ");
        $stmt->execute([$newCategory, $newName, $maxScore, $classId, $oldCategory, $oldName]);
    }

    private function updateClassGradeComponentMaxScore($classId, $category, $componentName, $maxScore) {
        $stmt = $this->db->prepare("
            UPDATE grade_components gc
            INNER JOIN enrollments e ON gc.enrollment_id = e.id
            SET gc.max_score = ?, gc.updated_at = NOW()
            WHERE e.class_record_id = ?
              AND gc.category = ?
              AND gc.component_name = ?
        ");
        $stmt->execute([$maxScore, $classId, $category, $componentName]);
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

    private function calculateTermStats($termComponents, $attendanceRows, $examWeight, $quizWeight, $projWeight, $attendanceWeight = 1.0) {
        $examAvg = $this->transmutedAverage($termComponents['major_exam'] ?? []);
        $quizAvg = $this->transmutedAverage($termComponents['quiz'] ?? []);
        $projectValues = $this->transmutedValues($termComponents['project'] ?? []);
        $attendanceValue = $this->transmutedAttendanceValue($attendanceRows);

        if ($attendanceValue !== null && $attendanceWeight > 0) {
            $projectValues[] = $attendanceValue * $attendanceWeight;
        }

        $projectAvg = $this->averagePresentValues($projectValues);
        $hasScores = $examAvg !== null || $quizAvg !== null || $projectAvg !== null;
        $weighted = $hasScores
            ? (($examAvg ?? 0) * $examWeight) + (($quizAvg ?? 0) * $quizWeight) + (($projectAvg ?? 0) * $projWeight)
            : null;

        return [
            'major_exam_avg' => $examAvg,
            'quiz_avg' => $quizAvg,
            'project_avg' => $projectAvg,
            'weighted_score' => $weighted,
            'has_scores' => $hasScores,
        ];
    }

    private function transmutedAverage($components) {
        return $this->averagePresentValues($this->transmutedValues($components));
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
        if (empty($rows)) return null;

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

        if (empty($values)) return null;

        return array_sum(array_map('floatval', $values)) / count($values);
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

    private function syncAttendanceComponent($enrollmentId, $encodedBy = null, $attendanceWeight = 1.0) {
        $rows = $this->getAttendanceRows($enrollmentId);
        $summary = $this->buildAttendanceSummary($rows);
        if ((int)$summary['total_sessions'] === 0 || $attendanceWeight <= 0) return;

        if (!$encodedBy) {
            $owner = $this->db->prepare("SELECT cr.faculty_id FROM enrollments e INNER JOIN class_records cr ON e.class_record_id = cr.id WHERE e.id = ?");
            $owner->execute([$enrollmentId]);
            $encodedBy = $owner->fetchColumn();
        }
        if (!$encodedBy) return;

        $adjustedScore = $summary['total_points'] * $attendanceWeight;
        $adjustedMax = $summary['possible_points'] * $attendanceWeight;

        $existing = $this->db->prepare("SELECT id FROM grade_components WHERE enrollment_id = ? AND category = 'project' AND component_name = 'Attendance' LIMIT 1");
        $existing->execute([$enrollmentId]);
        $componentId = $existing->fetchColumn();

        if ($componentId) {
            $stmt = $this->db->prepare("UPDATE grade_components SET max_score = ?, score = ?, encoded_by = ?, updated_at = NOW() WHERE id = ?");
            $stmt->execute([$adjustedMax, $adjustedScore, $encodedBy, $componentId]);
        } else {
            $stmt = $this->db->prepare("INSERT INTO grade_components (enrollment_id, category, component_name, max_score, score, encoded_by) VALUES (?, 'project', 'Attendance', ?, ?, ?)");
            $stmt->execute([$enrollmentId, $adjustedMax, $adjustedScore, $encodedBy]);
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

    private function notifyScoreUpdate($enrollmentId, $changedComponents = []) {
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

        $changesText = '';
        if (!empty($changedComponents)) {
            $limited = array_slice($changedComponents, 0, 3);
            $changesText = " Updates: " . implode(', ', $limited);
            if (count($changedComponents) > 3) {
                $changesText .= " and " . (count($changedComponents) - 3) . " more";
            }
            $changesText .= ".";
        }

        $notif = $this->db->prepare("
            INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id)
            VALUES (?, ?, ?, 'grade_updated', 'class_record', ?)
        ");
        $notif->execute([
            $row['student_id'],
            'Scores Updated',
            "Your live scores for {$row['subject_name']} ({$row['section']}) were updated.{$changesText} Final marks stay hidden until faculty verification.",
            $row['class_id'],
        ]);
    }

    private function mapToGradeScale($weighted, $gradeScale) {
        if ($weighted >= 99) return 1.00;
        if ($weighted >= 97) return 1.10;
        if ($weighted >= 95) return 1.20;
        if ($weighted >= 93) return 1.30;
        if ($weighted >= 91) return 1.40;
        if ($weighted >= 90) return 1.50;
        if ($weighted >= 89) return 1.60;
        if ($weighted >= 88) return 1.70;
        if ($weighted >= 87) return 1.80;
        if ($weighted >= 86) return 1.90;
        if ($weighted >= 85) return 2.00;
        if ($weighted >= 84) return 2.10;
        if ($weighted >= 83) return 2.20;
        if ($weighted >= 82) return 2.30;
        if ($weighted >= 81) return 2.40;
        if ($weighted >= 80) return 2.50;
        if ($weighted >= 79) return 2.60;
        if ($weighted >= 78) return 2.70;
        if ($weighted >= 77) return 2.80;
        if ($weighted >= 76) return 2.90;
        if ($weighted >= 75) return 3.00;
        return 5.00;
    }

    private function logAudit($userId, $action, $entityType = null, $entityId = null, $oldValues = null, $newValues = null) {
        try {
            $stmt = $this->db->prepare("INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$userId, $action, $entityType, $entityId, $oldValues ? json_encode($oldValues) : null, $newValues ? json_encode($newValues) : null, $_SERVER['REMOTE_ADDR'] ?? null, $_SERVER['HTTP_USER_AGENT'] ?? null]);
        } catch (Exception $e) {}
    }
}
