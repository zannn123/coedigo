import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import {
  ArrowLeft,
  UserPlus,
  Calculator,
  CheckCircle,
  Send,
  X,
  Plus,
  Trash2,
  CalendarDays,
  ClipboardCheck,
  Download,
  Save,
} from 'lucide-react';
import './GradeBook.css';

const CATEGORY_ORDER = ['major_exam', 'quiz', 'project'];
const CATEGORY_LABELS = {
  major_exam: 'Major Exams (40%)',
  quiz: 'Quizzes (30%)',
  project: 'Projects/Outputs (30%)',
};
const CATEGORY_SHORT_LABELS = {
  major_exam: 'Exam',
  quiz: 'Quiz',
  project: 'Project',
};
const DEFAULT_ASSESSMENTS = [
  { category: 'major_exam', component_name: 'Midterm Exam', max_score: 100 },
  { category: 'major_exam', component_name: 'Final Exam', max_score: 100 },
  { category: 'quiz', component_name: 'Quiz 1', max_score: 50 },
  { category: 'quiz', component_name: 'Quiz 2', max_score: 50 },
  { category: 'project', component_name: 'Project 1', max_score: 100 },
];
const AUTOSAVE_DELAY_MS = 1200;

let draftAssessmentCount = 0;

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function assessmentKey(category, componentName) {
  return `${category}:${normalizeName(componentName)}`;
}

function formatScoreValue(value) {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : String(value);
}

function sortAssessments(columns) {
  return [...columns].sort((a, b) => {
    const categoryDiff = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (categoryDiff !== 0) return categoryDiff;
    return String(a.component_name).localeCompare(String(b.component_name), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

function createDraftAssessment(category = 'quiz') {
  draftAssessmentCount += 1;
  const countLabel = draftAssessmentCount;
  const baseName = category === 'major_exam' ? 'Exam' : category === 'project' ? 'Project' : 'Quiz';

  return {
    key: `draft-${Date.now()}-${countLabel}`,
    category,
    component_name: `${baseName} ${countLabel}`,
    max_score: category === 'quiz' ? 50 : 100,
  };
}

function buildGradebookState(students) {
  const columnMap = new Map();
  const scoreMatrix = {};
  const componentIdsByEnrollment = {};

  students.forEach(student => {
    const enrollmentId = student.enrollment_id;
    scoreMatrix[enrollmentId] = {};
    componentIdsByEnrollment[enrollmentId] = {};

    (student.components || [])
      .filter(component => component.component_name !== 'Attendance')
      .forEach(component => {
        const key = assessmentKey(component.category, component.component_name);
        const maxScore = Number(component.max_score) || 0;

        if (!columnMap.has(key)) {
          columnMap.set(key, {
            key,
            category: component.category,
            component_name: component.component_name,
            max_score: maxScore,
          });
        } else {
          const existing = columnMap.get(key);
          existing.max_score = Math.max(Number(existing.max_score) || 0, maxScore);
        }

        componentIdsByEnrollment[enrollmentId][key] = component.id;
        scoreMatrix[enrollmentId][key] = formatScoreValue(component.score);
      });
  });

  let assessments = sortAssessments(Array.from(columnMap.values()));

  if (!assessments.length) {
    assessments = DEFAULT_ASSESSMENTS.map(component => ({
      ...component,
      key: assessmentKey(component.category, component.component_name),
    }));
  }

  students.forEach(student => {
    assessments.forEach(column => {
      if (scoreMatrix[student.enrollment_id][column.key] === undefined) {
        scoreMatrix[student.enrollment_id][column.key] = '';
      }
    });
  });

  return { assessments, scoreMatrix, componentIdsByEnrollment };
}

function isInvalidScore(score, maxScore) {
  if (score === '' || score === null || score === undefined) return false;
  const numericScore = Number(score);
  const numericMax = Number(maxScore);
  return !Number.isFinite(numericScore)
    || numericScore < 0
    || (Number.isFinite(numericMax) && numericMax > 0 && numericScore > numericMax);
}

export default function GradeBook() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [classData, setClassData] = useState(null);
  const [grades, setGrades] = useState([]);
  const [assessmentColumns, setAssessmentColumns] = useState([]);
  const [scoreMatrix, setScoreMatrix] = useState({});
  const [componentIdsByEnrollment, setComponentIdsByEnrollment] = useState({});
  const [deletedComponentIdsByEnrollment, setDeletedComponentIdsByEnrollment] = useState({});
  const [availableStudents, setAvailableStudents] = useState([]);
  const [showEnroll, setShowEnroll] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showAttendance, setShowAttendance] = useState(null);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [deletedAttendanceIds, setDeletedAttendanceIds] = useState([]);
  const [searchStudent, setSearchStudent] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savingScores, setSavingScores] = useState(false);
  const [exportingRecord, setExportingRecord] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [toast, setToast] = useState(null);
  const autosaveTimerRef = useRef(null);
  const saveVersionRef = useRef(0);

  const markGradebookDirty = () => {
    saveVersionRef.current += 1;
    setHasUnsavedChanges(true);
    setSaveStatus('pending');
  };

  const showToast = (message, type = 'success') => {
    setToast({ msg: message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = async () => {
    try {
      const [classResponse, gradesResponse] = await Promise.all([
        api.get(`/classes/${classId}`),
        api.get(`/grades/class/${classId}`),
      ]);
      const students = gradesResponse.data.data || [];
      const gradebookState = buildGradebookState(students);

      setClassData(classResponse.data.data);
      setGrades(students);
      setAssessmentColumns(gradebookState.assessments);
      setScoreMatrix(gradebookState.scoreMatrix);
      setComponentIdsByEnrollment(gradebookState.componentIdsByEnrollment);
      setDeletedComponentIdsByEnrollment({});
      setHasUnsavedChanges(false);
      setSaveStatus('saved');
      setLastSavedAt(null);
    } catch (error) {
      showToast(error.response?.data?.message || error.userMessage || 'Failed to load class record.', 'error');
    }
  };

  useEffect(() => {
    fetchData();
  }, [classId]);

  const groupedAssessments = useMemo(() => (
    CATEGORY_ORDER
      .map(category => ({
        category,
        label: CATEGORY_LABELS[category],
        columns: assessmentColumns.filter(column => column.category === category),
      }))
      .filter(group => group.columns.length)
  ), [assessmentColumns]);

  const invalidScoreCount = useMemo(() => (
    grades.reduce((count, student) => (
      count + assessmentColumns.filter(column => (
        isInvalidScore(scoreMatrix[student.enrollment_id]?.[column.key], column.max_score)
      )).length
    ), 0)
  ), [assessmentColumns, grades, scoreMatrix]);

  const encodedScoreCount = useMemo(() => (
    grades.reduce((count, student) => (
      count + assessmentColumns.filter(column => {
        const value = scoreMatrix[student.enrollment_id]?.[column.key];
        return value !== '' && value !== null && value !== undefined;
      }).length
    ), 0)
  ), [assessmentColumns, grades, scoreMatrix]);

  const totalScoreSlots = grades.length * assessmentColumns.length;

  const openEnroll = () => {
    api.get('/users?role=student&limit=100').then(response => {
      const enrolled = new Set(grades.map(grade => grade.student_id));
      setAvailableStudents((response.data.data || []).filter(student => !enrolled.has(student.id)));
    });
    setSelectedStudents([]);
    setShowEnroll(true);
  };

  const handleEnroll = async () => {
    if (!selectedStudents.length) return;

    try {
      await api.post(`/classes/${classId}/enroll`, { student_ids: selectedStudents });
      showToast('Students enrolled.');
      setShowEnroll(false);
      fetchData();
    } catch (error) {
      showToast(error.response?.data?.message || 'Error', 'error');
    }
  };

  const openAttendance = (student) => {
    setShowAttendance(student);
    setDeletedAttendanceIds([]);
    setAttendance((student.attendance || []).map(row => ({ ...row })));
  };

  const updateScore = (enrollmentId, columnKey, value) => {
    setScoreMatrix(matrix => ({
      ...matrix,
      [enrollmentId]: {
        ...(matrix[enrollmentId] || {}),
        [columnKey]: value,
      },
    }));
    markGradebookDirty();
  };

  const addAssessment = (category) => {
    const newColumn = createDraftAssessment(category);
    setAssessmentColumns(columns => sortAssessments([...columns, newColumn]));
    setScoreMatrix(matrix => {
      const next = { ...matrix };
      grades.forEach(student => {
        next[student.enrollment_id] = {
          ...(next[student.enrollment_id] || {}),
          [newColumn.key]: '',
        };
      });
      return next;
    });
    markGradebookDirty();
  };

  const updateAssessment = (columnKey, field, value) => {
    setAssessmentColumns(columns => {
      const next = columns.map(column => (
        column.key === columnKey ? { ...column, [field]: value } : column
      ));
      return field === 'category' ? sortAssessments(next) : next;
    });
    markGradebookDirty();
  };

  const removeAssessment = (columnKey) => {
    const column = assessmentColumns.find(item => item.key === columnKey);
    if (!column) return;

    const hasScores = grades.some(student => {
      const value = scoreMatrix[student.enrollment_id]?.[columnKey];
      return value !== '' && value !== null && value !== undefined;
    });

    if (hasScores && !window.confirm(`Remove ${column.component_name || 'this assessment'} and its saved scores from every student when you save?`)) {
      return;
    }

    setDeletedComponentIdsByEnrollment(previous => {
      const next = { ...previous };
      grades.forEach(student => {
        const componentId = componentIdsByEnrollment[student.enrollment_id]?.[columnKey];
        if (componentId) {
          next[student.enrollment_id] = [...(next[student.enrollment_id] || []), componentId];
        }
      });
      return next;
    });

    setAssessmentColumns(columns => columns.filter(item => item.key !== columnKey));
    setScoreMatrix(matrix => {
      const next = {};
      Object.entries(matrix).forEach(([enrollmentId, scores]) => {
        const { [columnKey]: _removed, ...rest } = scores;
        next[enrollmentId] = rest;
      });
      return next;
    });
    setComponentIdsByEnrollment(previous => {
      const next = {};
      Object.entries(previous).forEach(([enrollmentId, ids]) => {
        const { [columnKey]: _removed, ...rest } = ids;
        next[enrollmentId] = rest;
      });
      return next;
    });
    markGradebookDirty();
  };

  const validateGradebook = () => {
    if (!grades.length) {
      return { valid: false, message: 'Enroll students before saving scores.' };
    }

    if (!assessmentColumns.length) {
      return { valid: false, message: 'Add at least one quiz, exam, or project.' };
    }

    const normalizedColumns = assessmentColumns.map(column => ({
      ...column,
      component_name: String(column.component_name || '').trim(),
      max_score: Number(column.max_score),
    }));

    if (normalizedColumns.some(column => !column.component_name)) {
      return { valid: false, message: 'Every assessment needs a name.' };
    }

    if (normalizedColumns.some(column => !Number.isFinite(column.max_score) || column.max_score <= 0)) {
      return { valid: false, message: 'Every assessment needs a max score greater than 0.' };
    }

    const identities = normalizedColumns.map(column => assessmentKey(column.category, column.component_name));
    if (new Set(identities).size !== identities.length) {
      return { valid: false, message: 'Assessment names must be unique inside each category.' };
    }

    if (invalidScoreCount > 0) {
      return { valid: false, message: 'Fix scores that are invalid, negative, or above the max score.' };
    }

    return { valid: true, columns: normalizedColumns };
  };

  const saveScoreGrid = async ({ silent = false } = {}) => {
    const validation = validateGradebook();
    if (!validation.valid) {
      setSaveStatus('error');
      if (!silent) showToast(validation.message, 'error');
      return false;
    }

    const versionAtStart = saveVersionRef.current;
    setSavingScores(true);
    setSaveStatus('saving');

    try {
      let changedCount = 0;
      let statusReset = false;
      const nextComponentIds = {};
      const gradeUpdates = new Map();

      await Promise.all(grades.map(async student => {
        const enrollmentId = student.enrollment_id;
        const components = validation.columns.map(column => {
          const componentId = componentIdsByEnrollment[enrollmentId]?.[column.key];
          const scoreValue = scoreMatrix[enrollmentId]?.[column.key];
          const payload = {
            category: column.category,
            component_name: column.component_name,
            max_score: column.max_score,
            score: scoreValue === '' || scoreValue === null || scoreValue === undefined
              ? null
              : Number(scoreValue),
          };

          if (componentId) payload.id = componentId;
          return payload;
        });

        const response = await api.post('/grades/encode', {
          enrollment_id: enrollmentId,
          delete_ids: deletedComponentIdsByEnrollment[enrollmentId] || [],
          components,
        });

        const responseData = response.data?.data || {};
        const savedComponents = responseData.components || [];
        const returnedComponents = new Map(
          savedComponents
            .filter(component => component.component_name !== 'Attendance')
            .map(component => [assessmentKey(component.category, component.component_name), component])
        );

        nextComponentIds[enrollmentId] = {};
        validation.columns.forEach(column => {
          const returnedComponent = returnedComponents.get(assessmentKey(column.category, column.component_name));
          if (returnedComponent?.id) {
            nextComponentIds[enrollmentId][column.key] = returnedComponent.id;
          }
        });

        gradeUpdates.set(enrollmentId, {
          components: savedComponents,
          grade: responseData.grade,
        });

        if (responseData.changed) changedCount += 1;
        if (responseData.status_reset) statusReset = true;
      }));

      setComponentIdsByEnrollment(previous => ({ ...previous, ...nextComponentIds }));
      setDeletedComponentIdsByEnrollment({});
      setGrades(previous => previous.map(student => {
        const update = gradeUpdates.get(student.enrollment_id);
        if (!update) return student;

        return {
          ...student,
          components: update.components?.length ? update.components : student.components,
          grade: update.grade ? { ...(student.grade || {}), ...update.grade } : student.grade,
        };
      }));

      if (statusReset) {
        setClassData(previous => previous ? {
          ...previous,
          grade_status: 'draft',
          verified_at: null,
          released_at: null,
        } : previous);
      }

      if (saveVersionRef.current === versionAtStart) {
        setHasUnsavedChanges(false);
        setSaveStatus('saved');
      } else {
        setSaveStatus('pending');
      }
      setLastSavedAt(new Date());

      if (!silent) {
        showToast(
          changedCount
            ? (statusReset ? 'Scores saved. Final marks stay hidden until the class is verified again.' : 'Scores saved successfully.')
            : 'No score changes detected.'
        );
      }

      return true;
    } catch (error) {
      setSaveStatus('error');
      if (!silent) showToast(error.response?.data?.message || 'Failed to save score grid.', 'error');
      return false;
    } finally {
      setSavingScores(false);
    }
  };

  useEffect(() => {
    window.clearTimeout(autosaveTimerRef.current);

    if (!hasUnsavedChanges || savingScores) return undefined;
    if (!grades.length || !assessmentColumns.length) return undefined;

    if (invalidScoreCount > 0) {
      setSaveStatus('error');
      return undefined;
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      saveScoreGrid({ silent: true });
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(autosaveTimerRef.current);
  }, [
    hasUnsavedChanges,
    savingScores,
    scoreMatrix,
    assessmentColumns,
    deletedComponentIdsByEnrollment,
    invalidScoreCount,
    grades.length,
  ]);

  const updateAttendance = (index, field, value) => {
    const rows = [...attendance];
    rows[index][field] = value;
    setAttendance(rows);
  };

  const addAttendance = () => {
    const today = new Date().toISOString().slice(0, 10);
    setAttendance([...attendance, { attendance_date: today, status: 'present' }]);
  };

  const removeAttendance = (index) => {
    const removed = attendance[index];
    if (removed?.id) setDeletedAttendanceIds(ids => [...ids, removed.id]);
    setAttendance(attendance.filter((_, rowIndex) => rowIndex !== index));
  };

  const saveAttendance = async () => {
    try {
      const response = await api.post('/grades/attendance', {
        enrollment_id: showAttendance.enrollment_id,
        attendance: attendance
          .filter(row => row.attendance_date)
          .map(row => ({
            id: row.id,
            attendance_date: row.attendance_date,
            status: row.status || 'absent',
          })),
        delete_ids: deletedAttendanceIds,
      });

      const statusReset = Boolean(response.data?.data?.status_reset);
      showToast(statusReset ? 'Attendance saved. Final marks stay hidden until verification.' : 'Attendance saved.');
      setShowAttendance(null);
      fetchData();
    } catch (error) {
      showToast(error.response?.data?.message || 'Error', 'error');
    }
  };

  const computeAll = async () => {
    try {
      await api.post(`/grades/compute-class/${classId}`);
      showToast('All grades computed.');
      fetchData();
    } catch (error) {
      showToast('Error computing', 'error');
    }
  };

  const getDownloadFilename = (disposition) => {
    const match = disposition?.match(/filename="?([^"]+)"?/i);
    return match?.[1] || `${classData?.subject_code || 'class'}-${classData?.section || classId}-class-record.xlsx`;
  };

  const getBlobErrorMessage = async (error) => {
    const blob = error.response?.data;
    if (!(blob instanceof Blob)) return null;

    try {
      const text = await blob.text();
      const parsed = JSON.parse(text);
      return parsed.message;
    } catch {
      return null;
    }
  };

  const downloadClassRecord = async () => {
    if (invalidScoreCount > 0) {
      showToast('Fix score issues before downloading the class record.', 'error');
      return;
    }

    setExportingRecord(true);
    try {
      if (hasUnsavedChanges && grades.length && assessmentColumns.length) {
        const saved = await saveScoreGrid({ silent: true });
        if (!saved) {
          showToast('Unable to save changes before export.', 'error');
          return;
        }
      }

      const response = await api.get(`/reports/class/${classId}/xlsx`, { responseType: 'blob' });
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = getDownloadFilename(response.headers['content-disposition']);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast('Excel file downloaded.');
    } catch (error) {
      const message = await getBlobErrorMessage(error);
      showToast(message || error.response?.data?.message || 'Failed to download Excel file.', 'error');
    } finally {
      setExportingRecord(false);
    }
  };

  const updateStatus = async (status) => {
    try {
      await api.put(`/classes/${classId}/status`, { grade_status: status });
      showToast(`Status: ${status.replace('_', ' ')}`);
      fetchData();
    } catch (error) {
      showToast(error.response?.data?.message || 'Error', 'error');
    }
  };

  const attendanceStats = rows => {
    const total = rows.length;
    const present = rows.filter(row => row.status === 'present').length;
    return { total, present, percentage: total ? Math.round((present / total) * 100) : null };
  };

  if (!classData) return <div className="empty-state">Loading...</div>;

  const finalMarksVisible = classData.grade_status !== 'draft';
  const statusBadge = { draft: 'badge-warning', faculty_verified: 'badge-info', officially_released: 'badge-success' };
  const saveStatusClass = invalidScoreCount > 0 || saveStatus === 'error'
    ? 'is-error'
    : savingScores || saveStatus === 'saving'
      ? 'is-saving'
      : hasUnsavedChanges
        ? 'is-pending'
        : 'is-saved';
  const saveStatusLabel = savingScores || saveStatus === 'saving'
    ? 'Autosaving...'
    : invalidScoreCount > 0
      ? 'Fix score issues'
      : saveStatus === 'error'
        ? 'Autosave paused'
        : hasUnsavedChanges
          ? 'Autosave pending'
          : lastSavedAt
            ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
            : 'Autosave on';

  return (
    <div className="animate-in">
      <div className="page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/faculty/classes')} style={{ marginBottom: '0.75rem' }}>
          <ArrowLeft size={16} /> Back to Classes
        </button>
        <div className="flex-between">
          <div>
            <h1>{classData.subject_code} - {classData.subject_name}</h1>
            <p>Section {classData.section} | {classData.semester} {classData.academic_year} | {classData.faculty_name}</p>
          </div>
          <span className={`badge ${statusBadge[classData.grade_status]}`} style={{ fontSize: '0.8125rem', padding: '0.375rem 0.875rem' }}>
            {classData.grade_status?.replace('_', ' ')}
          </span>
        </div>
      </div>

      <div className="gradebook-toolbar">
        <button className="btn btn-primary" onClick={openEnroll}><UserPlus size={16} />Enroll Students</button>
        <button className="btn btn-secondary" onClick={() => setShowSetup(true)}><ClipboardCheck size={16} />Shared Assessments</button>
        <button className="btn btn-secondary" onClick={downloadClassRecord} disabled={exportingRecord || savingScores}>
          {exportingRecord ? <span className="spinner" /> : <Download size={16} />}
          {exportingRecord ? 'Preparing...' : 'Download Excel'}
        </button>
        <button className="btn btn-secondary" onClick={computeAll}><Calculator size={16} />Compute All</button>
        {classData.grade_status === 'draft' && <button className="btn btn-secondary" onClick={() => updateStatus('faculty_verified')}><CheckCircle size={16} />Mark Verified</button>}
        {classData.grade_status === 'faculty_verified' && <button className="btn btn-primary" onClick={() => updateStatus('officially_released')}><Send size={16} />Release Grades</button>}
      </div>

      <div className="gradebook-metrics">
        <div><strong>{grades.length}</strong><span>Students</span></div>
        <div><strong>{assessmentColumns.length}</strong><span>Shared Assessments</span></div>
        <div><strong>{encodedScoreCount}/{totalScoreSlots || 0}</strong><span>Filled Score Cells</span></div>
        <div><strong>{invalidScoreCount}</strong><span>Score Issues</span></div>
      </div>

      <div className="gradebook-savebar">
        <div className={`gradebook-autosave-status ${saveStatusClass}`}>
          <span aria-hidden="true" />
          <strong>{saveStatusLabel}</strong>
        </div>
        <button className="btn btn-secondary" onClick={() => saveScoreGrid()} disabled={savingScores || invalidScoreCount > 0 || !grades.length}>
          {savingScores ? <span className="spinner" /> : <Save size={16} />}
          {savingScores ? 'Saving...' : 'Save now'}
        </button>
      </div>

      <div className="table-container gradebook-table-container">
        <table className="gradebook-table" style={{ minWidth: `${620 + (assessmentColumns.length * 132)}px` }}>
          <thead>
            <tr className="gradebook-group-row">
              <th rowSpan={2} className="gradebook-student-col">Student</th>
              {groupedAssessments.map(group => (
                <th key={group.category} colSpan={group.columns.length} className={`gradebook-category gradebook-category-${group.category}`}>
                  {group.label}
                </th>
              ))}
              <th rowSpan={2}>Attendance</th>
              <th rowSpan={2}>Weighted</th>
              <th rowSpan={2}>Grade</th>
              <th rowSpan={2}>Remarks</th>
            </tr>
            <tr>
              {assessmentColumns.map(column => (
                <th key={column.key} className="gradebook-assessment-header">
                  <div className="gradebook-assessment-title">
                    <span>{column.component_name || 'Untitled'}</span>
                    <button type="button" className="gradebook-remove-assessment" onClick={() => removeAssessment(column.key)} aria-label={`Remove ${column.component_name || 'assessment'}`}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <small>{CATEGORY_SHORT_LABELS[column.category]} / {column.max_score || 0} pts</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grades.map((student, index) => (
              <tr key={student.enrollment_id}>
                <td className="gradebook-student-col">
                  <div className="gradebook-student-name">{index + 1}. {student.last_name}, {student.first_name}</div>
                  <div className="gradebook-student-meta">{student.student_number || 'No student no.'} | {student.program || 'No program'}</div>
                </td>
                {assessmentColumns.map(column => {
                  const score = scoreMatrix[student.enrollment_id]?.[column.key] ?? '';
                  const invalid = isInvalidScore(score, column.max_score);

                  return (
                    <td key={`${student.enrollment_id}-${column.key}`} className={`gradebook-score-cell ${invalid ? 'is-invalid' : ''}`}>
                      <input
                        type="number"
                        className="gradebook-score-input"
                        min="0"
                        max={column.max_score || undefined}
                        step="0.01"
                        value={score}
                        onChange={event => updateScore(student.enrollment_id, column.key, event.target.value)}
                        aria-label={`${column.component_name} score for ${student.last_name}, ${student.first_name}`}
                      />
                    </td>
                  );
                })}
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => openAttendance(student)}>
                    <CalendarDays size={14} />
                    {student.attendance_summary?.total_sessions
                      ? `${parseFloat(student.attendance_summary.total_points).toFixed(0)}/${student.attendance_summary.possible_points}`
                      : 'Add'}
                  </button>
                </td>
                <td style={{ fontWeight: 600 }}>
                  {finalMarksVisible && student.grade?.weighted_score != null
                    ? `${parseFloat(student.grade.weighted_score).toFixed(1)}%`
                    : <span style={{ color: 'var(--text-muted)' }}>Pending</span>}
                </td>
                <td style={{ fontWeight: 700, color: finalMarksVisible ? (student.grade?.final_grade <= 3 ? 'var(--success)' : student.grade?.final_grade ? 'var(--danger)' : 'var(--text-muted)') : 'var(--text-muted)' }}>
                  {finalMarksVisible ? (student.grade?.final_grade ?? '-') : '-'}
                </td>
                <td>
                  {finalMarksVisible
                    ? <span className={`badge ${student.grade?.remarks === 'Passed' ? 'badge-success' : student.grade?.remarks === 'Failed' ? 'badge-danger' : 'badge-warning'}`}>{student.grade?.remarks || 'No Grade'}</span>
                    : <span className="badge badge-warning">Draft</span>}
                </td>
              </tr>
            ))}
            {!grades.length && <tr><td colSpan={assessmentColumns.length + 5} className="empty-state">No students enrolled</td></tr>}
          </tbody>
        </table>
      </div>

      {showSetup && (
        <div className="modal-overlay" onClick={() => setShowSetup(false)}>
          <div className="modal-content" onClick={event => event.stopPropagation()} style={{ maxWidth: '820px' }}>
            <div className="flex-between" style={{ marginBottom: '1rem' }}>
              <div>
                <h2>Shared Assessments</h2>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSetup(false)}><X size={18} /></button>
            </div>

            <div className="gradebook-setup-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => addAssessment('quiz')}><Plus size={14} />Add Quiz</button>
              <button className="btn btn-secondary btn-sm" onClick={() => addAssessment('major_exam')}><Plus size={14} />Add Exam</button>
              <button className="btn btn-secondary btn-sm" onClick={() => addAssessment('project')}><Plus size={14} />Add Project</button>
            </div>

            <div className="gradebook-setup-list">
              {assessmentColumns.map(column => (
                <div key={column.key} className="gradebook-setup-row">
                  <select className="input-field" value={column.category} onChange={event => updateAssessment(column.key, 'category', event.target.value)}>
                    <option value="quiz">Quiz</option>
                    <option value="major_exam">Major Exam</option>
                    <option value="project">Project/Output</option>
                  </select>
                  <input className="input-field" value={column.component_name} onChange={event => updateAssessment(column.key, 'component_name', event.target.value)} placeholder="Assessment name" />
                  <input type="number" min="1" className="input-field" value={column.max_score} onChange={event => updateAssessment(column.key, 'max_score', event.target.value)} placeholder="Max score" />
                  <button className="btn btn-ghost btn-sm" onClick={() => removeAssessment(column.key)}><Trash2 size={14} /></button>
                </div>
              ))}
              {!assessmentColumns.length && <div className="empty-state" style={{ padding: '1rem' }}>No assessments yet. Add a quiz, exam, or project.</div>}
            </div>

            <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} onClick={() => setShowSetup(false)}>Done</button>
          </div>
        </div>
      )}

      {showEnroll && (
        <div className="modal-overlay" onClick={() => setShowEnroll(false)}>
          <div className="modal-content" onClick={event => event.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="flex-between" style={{ marginBottom: '1rem' }}>
              <h2>Enroll Students</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowEnroll(false)}><X size={18} /></button>
            </div>
            <input className="input-field" style={{ width: '100%', marginBottom: '1rem' }} placeholder="Search students..." value={searchStudent} onChange={event => setSearchStudent(event.target.value)} />
            <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {availableStudents.filter(student => !searchStudent || `${student.first_name} ${student.last_name} ${student.student_id}`.toLowerCase().includes(searchStudent.toLowerCase())).map(student => (
                <label key={student.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: selectedStudents.includes(student.id) ? 'var(--accent-muted)' : 'transparent' }}>
                  <input type="checkbox" checked={selectedStudents.includes(student.id)} onChange={event => setSelectedStudents(event.target.checked ? [...selectedStudents, student.id] : selectedStudents.filter(id => id !== student.id))} />
                  <span style={{ fontWeight: 500 }}>{student.last_name}, {student.first_name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginLeft: 'auto' }}>{student.student_id || ''} {student.program || ''}</span>
                </label>
              ))}
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} onClick={handleEnroll} disabled={!selectedStudents.length}>Enroll {selectedStudents.length} Student(s)</button>
          </div>
        </div>
      )}

      {showAttendance && (
        <div className="modal-overlay" onClick={() => setShowAttendance(null)}>
          <div className="modal-content" onClick={event => event.stopPropagation()} style={{ maxWidth: '760px' }}>
            <div className="flex-between" style={{ marginBottom: '1rem' }}>
              <div>
                <h2>Attendance: {showAttendance.last_name}, {showAttendance.first_name}</h2>
                <p className="gradebook-modal-note">Present marks count as 1 point each.</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAttendance(null)}><X size={18} /></button>
            </div>

            <div className="flex-between" style={{ marginBottom: '0.75rem' }}>
              {(() => {
                const stats = attendanceStats(attendance);
                return (
                  <div className="metric-strip" style={{ flex: 1 }}>
                    <div><strong>{stats.present}</strong><span>Present Points</span></div>
                    <div><strong>{stats.total}</strong><span>Class Dates</span></div>
                    <div><strong>{stats.percentage ?? '-'}{stats.percentage != null ? '%' : ''}</strong><span>Attendance Rate</span></div>
                  </div>
                );
              })()}
            </div>

            <button className="btn btn-ghost btn-sm" onClick={addAttendance} style={{ marginBottom: '0.75rem' }}><Plus size={14} /> Add Date</button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {attendance.map((row, index) => (
                <div key={row.id || index} className="attendance-row">
                  <input type="date" className="input-field" value={row.attendance_date || ''} onChange={event => updateAttendance(index, 'attendance_date', event.target.value)} />
                  <select className="input-field" value={row.status || 'absent'} onChange={event => updateAttendance(index, 'status', event.target.value)}>
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                  </select>
                  <span className={`badge ${row.status === 'present' ? 'badge-success' : 'badge-danger'}`}>{row.status === 'present' ? '+1 point' : '0 point'}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeAttendance(index)}><Trash2 size={14} /></button>
                </div>
              ))}
              {!attendance.length && <div className="empty-state" style={{ padding: '1rem' }}>No attendance dates encoded yet</div>}
            </div>

            <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} onClick={saveAttendance}>Save Attendance</button>
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
