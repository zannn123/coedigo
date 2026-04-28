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
  RotateCcw,
  Info,
} from 'lucide-react';
import './GradeBook.css';

const CATEGORY_ORDER = ['major_exam', 'quiz', 'project'];
const CATEGORY_LABELS = {
  major_exam: 'Major Exams',
  quiz: 'Quizzes',
  project: 'Performance Tasks',
};
const CATEGORY_SHORT_LABELS = {
  major_exam: 'Exam',
  quiz: 'Quiz',
  project: 'Project',
};
const PERIODS = ['midterm', 'final'];
const PERIOD_LABELS = { midterm: 'Midterm', final: 'Final' };
const TERM_GRADE_SHORT_LABELS = { midterm: 'MG', final: 'FG' };
const DEFAULT_GRADING_WEIGHTS = {
  major_exam: 30,
  quiz: 30,
  project: 40,
};


const AUTOSAVE_DELAY_MS = 1200;

let draftAssessmentCount = 0;

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseComponent(rawName) {
  let period = 'midterm';
  let cleanName = String(rawName || '').trim();
  if (cleanName.startsWith('[Final] ')) {
    period = 'final';
    cleanName = cleanName.substring(8).trim();
  } else if (cleanName.startsWith('[Midterm] ')) {
    period = 'midterm';
    cleanName = cleanName.substring(10).trim();
  } else if (cleanName.toLowerCase().includes('final')) {
    period = 'final';
  }
  return { period, cleanName };
}

function formatComponentName(period, cleanName) {
  const p = period === 'final' ? 'Final' : 'Midterm';
  return `[${p}] ${cleanName}`;
}

function assessmentKey(category, componentName) {
  return `${category}:${normalizeName(componentName)}`;
}

function formatScoreValue(value) {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : String(value);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeGradeStudent(student) {
  return {
    ...student,
    components: ensureArray(student?.components),
    attendance: ensureArray(student?.attendance),
    grade: student?.grade && typeof student.grade === 'object' ? student.grade : null,
    attendance_summary: student?.attendance_summary && typeof student.attendance_summary === 'object'
      ? student.attendance_summary
      : null,
  };
}

function formatAttendanceDateLabel(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value || 'Date');
  }

  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatWeightedScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : null;
}

function formatRecordNumber(value, digits = 0) {
  if (value === null || value === undefined || value === '') return '--';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return numeric.toFixed(digits);
}

function formatWeightPercent(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(digits).replace(/\.0$/, '');
}

function settingsRowsToMap(rows) {
  const map = {};
  ensureArray(rows).forEach(setting => {
    if (setting?.setting_key) {
      map[setting.setting_key] = setting.setting_value;
    }
  });
  return map;
}

function normalizeWeight(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function normalizeGradingWeights(rows) {
  const settings = settingsRowsToMap(rows);
  return {
    major_exam: normalizeWeight(settings.major_exam_weight, DEFAULT_GRADING_WEIGHTS.major_exam),
    quiz: normalizeWeight(settings.quiz_weight, DEFAULT_GRADING_WEIGHTS.quiz),
    project: normalizeWeight(settings.project_weight, DEFAULT_GRADING_WEIGHTS.project),
  };
}

function numericScore(value) {
  if (value === '' || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function transmutedScore(score, maxScore) {
  const numericScoreValue = numericScore(score);
  const numericMaxScore = Number(maxScore);
  if (numericScoreValue === null || !Number.isFinite(numericMaxScore) || numericMaxScore <= 0) {
    return null;
  }
  return ((numericScoreValue / numericMaxScore) * 50) + 50;
}

function performanceTaskAverage(columns, scoreFor) {
  const values = [];
  let subtotalScore = 0;
  let subtotalMax = 0;

  columns
    .filter(column => column.category === 'project')
    .forEach(column => {
      const score = numericScore(scoreFor(column));
      const maxScore = Number(column.max_score);

      if (score === null || !Number.isFinite(maxScore) || maxScore <= 0) {
        return;
      }

      if (maxScore < 100) {
        subtotalScore += score;
        subtotalMax += maxScore;
        return;
      }

      values.push((score / maxScore) * 100);
    });

  const subtotalGrade = subtotalMax > 0 ? transmutedScore(subtotalScore, subtotalMax) : null;
  if (subtotalGrade !== null) {
    values.unshift(subtotalGrade);
  }

  return averageValues(values);
}

function averageValues(values) {
  const present = values.filter(value => value !== null && value !== undefined && Number.isFinite(Number(value)));
  if (!present.length) return null;
  return present.reduce((sum, value) => sum + Number(value), 0) / present.length;
}

function mapPercentageToGrade(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric >= 99) return 1.00;
  if (numeric >= 97) return 1.10;
  if (numeric >= 95) return 1.20;
  if (numeric >= 93) return 1.30;
  if (numeric >= 91) return 1.40;
  if (numeric >= 90) return 1.50;
  if (numeric >= 89) return 1.60;
  if (numeric >= 88) return 1.70;
  if (numeric >= 87) return 1.80;
  if (numeric >= 86) return 1.90;
  if (numeric >= 85) return 2.00;
  if (numeric >= 84) return 2.10;
  if (numeric >= 83) return 2.20;
  if (numeric >= 82) return 2.30;
  if (numeric >= 81) return 2.40;
  if (numeric >= 80) return 2.50;
  if (numeric >= 79) return 2.60;
  if (numeric >= 78) return 2.70;
  if (numeric >= 77) return 2.80;
  if (numeric >= 76) return 2.90;
  if (numeric >= 75) return 3.00;
  return 5.00;
}

function getFinalGradeColor(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'var(--text-muted)';
  return numeric <= 3 ? 'var(--success)' : 'var(--danger)';
}

function splitAttendanceRowsByTerm(rows, assessmentColumns) {
  const sortedRows = ensureArray(rows)
    .filter(row => row.attendance_date)
    .sort((a, b) => String(a.attendance_date).localeCompare(String(b.attendance_date)));
  
  if (sortedRows.length === 0) {
    return { midterm: [], final: [] };
  }
  
  const hasMidterm = assessmentColumns.some(col => col.period === 'midterm');
  const hasFinal = assessmentColumns.some(col => col.period === 'final');
  
  // If only midterm assessments exist, all attendance goes to midterm
  if (hasMidterm && !hasFinal) {
    return { midterm: sortedRows, final: [] };
  }
  
  // If only final assessments exist, all attendance goes to final
  if (hasFinal && !hasMidterm) {
    return { midterm: [], final: sortedRows };
  }
  
  // If both periods have assessments, keep all existing attendance in midterm
  // Faculty must explicitly add new attendance dates for final period
  return { midterm: sortedRows, final: [] };
}

function splitAttendanceDatesByTerm(dates, assessmentColumns) {
  const sortedDates = ensureArray(dates).filter(Boolean).sort();
  
  if (sortedDates.length === 0) {
    return [];
  }
  
  const hasMidterm = assessmentColumns.some(col => col.period === 'midterm');
  const hasFinal = assessmentColumns.some(col => col.period === 'final');
  
  // If only midterm assessments exist, all attendance goes to midterm
  if (hasMidterm && !hasFinal) {
    return [{ period: 'midterm', label: 'Midterm Attendance', dates: sortedDates }].filter(group => group.dates.length > 0);
  }
  
  // If only final assessments exist, all attendance goes to final
  if (hasFinal && !hasMidterm) {
    return [{ period: 'final', label: 'Final Attendance', dates: sortedDates }].filter(group => group.dates.length > 0);
  }
  
  // If both periods have assessments, keep all existing attendance in midterm
  // Faculty must explicitly add new attendance dates for final period
  return [{ period: 'midterm', label: 'Midterm Attendance', dates: sortedDates }].filter(group => group.dates.length > 0);
}

function sortAssessments(columns) {
  return [...columns].sort((a, b) => {
    if (a.period !== b.period) return PERIODS.indexOf(a.period) - PERIODS.indexOf(b.period);

    const categoryDiff = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (categoryDiff !== 0) return categoryDiff;

    return String(a.clean_name).localeCompare(String(b.clean_name), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

function createDraftAssessment(category = 'quiz', period = 'midterm') {
  draftAssessmentCount += 1;
  const countLabel = draftAssessmentCount;
  const baseName = category === 'major_exam' ? 'Exam' : category === 'project' ? 'Project' : 'Quiz';
  const assessmentName = `${baseName} ${countLabel}`;

  return {
    key: assessmentKey(category, formatComponentName(period, assessmentName)),
    category,
    period,
    clean_name: assessmentName,
    max_score: category === 'quiz' ? 50 : 100,
    isDraft: true,
  };
}

function buildGradebookState(students, classAssessments = []) {
  const columnMap = new Map();
  const scoreMatrix = {};
  const componentIdsByEnrollment = {};

  ensureArray(classAssessments).forEach(assessment => {
    if (!assessment?.category || !assessment?.component_name) return;
    const key = assessmentKey(assessment.category, assessment.component_name);
    const parsed = parseComponent(assessment.component_name);
    columnMap.set(key, {
      key,
      assessment_id: assessment.id,
      category: assessment.category,
      period: parsed.period,
      clean_name: parsed.cleanName,
      max_score: Number(assessment.max_score) || 0,
    });
  });

  students.forEach(student => {
    const enrollmentId = student.enrollment_id;
    scoreMatrix[enrollmentId] = {};
    componentIdsByEnrollment[enrollmentId] = {};

    (student.components || [])
      .filter(component => component.component_name !== 'Attendance')
      .forEach(component => {
        const key = assessmentKey(component.category, component.component_name);
        const maxScore = Number(component.max_score) || 0;
        const parsed = parseComponent(component.component_name);

        if (!columnMap.has(key)) {
          columnMap.set(key, {
            key,
            assessment_id: component.assessment_id,
            category: component.category,
            period: parsed.period,
            clean_name: parsed.cleanName,
            max_score: maxScore,
          });
        } else {
          const existing = columnMap.get(key);
          existing.max_score = Math.max(Number(existing.max_score) || 0, maxScore);
          if (!existing.assessment_id && component.assessment_id) {
            existing.assessment_id = component.assessment_id;
          }
        }

        componentIdsByEnrollment[enrollmentId][key] = component.id;
        scoreMatrix[enrollmentId][key] = formatScoreValue(component.score);
      });
  });

  const assessments = sortAssessments(Array.from(columnMap.values()));

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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [grades, setGrades] = useState([]);
  const [assessmentColumns, setAssessmentColumns] = useState([]);
  const [scoreMatrix, setScoreMatrix] = useState({});
  const [componentIdsByEnrollment, setComponentIdsByEnrollment] = useState({});
  const [deletedComponentIdsByEnrollment, setDeletedComponentIdsByEnrollment] = useState({});
  const [deletedAssessmentIds, setDeletedAssessmentIds] = useState([]);
  const [hasAssessmentDefinitionChanges, setHasAssessmentDefinitionChanges] = useState(false);
  const [availableStudents, setAvailableStudents] = useState([]);
  const [showEnroll, setShowEnroll] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [activeTab, setActiveTab] = useState('midterm');
  const [showAttendance, setShowAttendance] = useState(null);
  const [showDailyAttendance, setShowDailyAttendance] = useState(false);
  const [dailyAttendanceDate, setDailyAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dailyAttendancePeriod, setDailyAttendancePeriod] = useState('midterm');
  const [dailyAttendanceMap, setDailyAttendanceMap] = useState({});
  const [savingDailyAttendance, setSavingDailyAttendance] = useState(false);
  const [deletingAttendanceDate, setDeletingAttendanceDate] = useState(null);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [deletedAttendanceIds, setDeletedAttendanceIds] = useState([]);
  const [searchStudent, setSearchStudent] = useState('');
  const [filterProgram, setFilterProgram] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savingScores, setSavingScores] = useState(false);
  const [exportingRecord, setExportingRecord] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [toast, setToast] = useState(null);
  const [attendanceWeight, setAttendanceWeight] = useState(5);
  const [gradingWeights, setGradingWeights] = useState(DEFAULT_GRADING_WEIGHTS);
  const [showAttendanceSettings, setShowAttendanceSettings] = useState(false);
  const [savingAttendanceWeight, setSavingAttendanceWeight] = useState(false);
  const [termGradesUnlocked, setTermGradesUnlocked] = useState(false);
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
    setIsLoading(true);
    setLoadError('');

    try {
      const [classResponse, gradesResponse, settingsResponse] = await Promise.all([
        api.get(`/classes/${classId}`),
        api.get(`/grades/class/${classId}`),
        api.get('/settings').catch(() => ({ data: { data: [] } })),
      ]);
      const gradePayload = gradesResponse.data?.data;
      const students = ensureArray(Array.isArray(gradePayload) ? gradePayload : gradePayload?.students).map(normalizeGradeStudent);
      const gradebookState = buildGradebookState(students, Array.isArray(gradePayload) ? [] : gradePayload?.assessments);
      const fetchedClassData = classResponse.data?.data || null;

      setClassData(fetchedClassData);
      setGradingWeights(normalizeGradingWeights(settingsResponse.data?.data));
      setAttendanceWeight(fetchedClassData?.attendance_weight ?? 5);
      setTermGradesUnlocked(previous => previous || fetchedClassData?.grade_status !== 'draft');
      setGrades(students);
      setAssessmentColumns(gradebookState.assessments);
      setScoreMatrix(gradebookState.scoreMatrix);
      setComponentIdsByEnrollment(gradebookState.componentIdsByEnrollment);
      setDeletedComponentIdsByEnrollment({});
      setDeletedAssessmentIds([]);
      setHasAssessmentDefinitionChanges(false);
      setHasUnsavedChanges(false);
      setSaveStatus('saved');
      setLastSavedAt(null);
      setLoadError('');
    } catch (error) {
      const message = error.response?.data?.message || error.userMessage || 'Failed to load class record.';
      setClassData(null);
      setGrades([]);
      setAssessmentColumns([]);
      setScoreMatrix({});
      setComponentIdsByEnrollment({});
      setDeletedComponentIdsByEnrollment({});
      setDeletedAssessmentIds([]);
      setHasAssessmentDefinitionChanges(false);
      setLoadError(message);
      showToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [classId]);

  const attendanceDates = useMemo(() => {
    const dates = new Set();
    grades.forEach(student => {
      ensureArray(student.attendance).forEach(record => {
        if (record.attendance_date) dates.add(record.attendance_date);
      });
    });
    return Array.from(dates).sort();
  }, [grades]);
  const attendanceDateGroups = useMemo(() => splitAttendanceDatesByTerm(attendanceDates, assessmentColumns), [attendanceDates, assessmentColumns]);

  const groupedAssessments = useMemo(() => {
    const groups = [];
    PERIODS.forEach(period => {
      CATEGORY_ORDER.forEach(category => {
        const columns = assessmentColumns.filter(c => c.period === period && c.category === category);
        if (columns.length > 0) {
          groups.push({
            id: `${period}-${category}`,
            period,
            category,
            columns
          });
        }
      });
    });
    return groups;
  }, [assessmentColumns]);

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
    api.get('/users?role=student&limit=5000').then(response => {
      const enrolled = new Set(grades.map(grade => grade.student_id));
      setAvailableStudents((response.data.data || []).filter(student => !enrolled.has(student.id)));
    });
    setSelectedStudents([]);
    setFilterProgram('');
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

  const addAssessment = (category, period = 'midterm') => {
    const newColumn = createDraftAssessment(category, period);

    // Check if assessment with same key already exists
    const existingColumn = assessmentColumns.find(col => col.key === newColumn.key);
    if (existingColumn) {
      showToast('An assessment with this name already exists in this period.', 'error');
      return;
    }

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
    setHasAssessmentDefinitionChanges(true);
    markGradebookDirty();
  };

  const updateAssessment = (columnKey, field, value) => {
    setAssessmentColumns(columns => {
      const next = columns.map(column => (
        column.key === columnKey ? { ...column, [field]: value } : column
      ));
      return field === 'category' || field === 'period' || field === 'clean_name' ? sortAssessments(next) : next;
    });
    setHasAssessmentDefinitionChanges(true);
    markGradebookDirty();
  };

  const removeAssessment = (columnKey) => {
    const column = assessmentColumns.find(item => item.key === columnKey);
    if (!column) return;

    const hasScores = grades.some(student => {
      const value = scoreMatrix[student.enrollment_id]?.[columnKey];
      return value !== '' && value !== null && value !== undefined;
    });

    if (hasScores && !window.confirm(`Remove ${column.clean_name || 'this assessment'} and its saved scores from every student when you save?`)) {
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
    if (column.assessment_id) {
      setDeletedAssessmentIds(ids => ids.includes(column.assessment_id) ? ids : [...ids, column.assessment_id]);
    }
    setHasAssessmentDefinitionChanges(true);

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
      if (!assessmentColumns.length) {
        return { valid: true, columns: [] };
      }
    }

    if (!assessmentColumns.length) {
      return { valid: true, columns: [] };
    }

    const normalizedColumns = assessmentColumns.map(column => ({
      ...column,
      clean_name: String(column.clean_name || '').trim(),
      max_score: Number(column.max_score) || 0,
    }));

    const columnsToValidate = normalizedColumns.filter(column => {
      const hasScore = grades.some(student => {
        const value = scoreMatrix[student.enrollment_id]?.[column.key];
        return value !== '' && value !== null && value !== undefined;
      });
      return hasScore || column.isDraft || column.assessment_id || !grades.length;
    });

    if (columnsToValidate.some(column => !column.clean_name)) {
      return { valid: false, message: 'Every assessment needs a name.' };
    }

    if (columnsToValidate.some(column => !Number.isFinite(column.max_score) || column.max_score <= 0)) {
      return { valid: false, message: 'Every assessment needs a max score greater than 0.' };
    }

    const identities = columnsToValidate.map(column =>
      assessmentKey(column.category, formatComponentName(column.period, column.clean_name))
    );
    if (new Set(identities).size !== identities.length) {
      return { valid: false, message: 'Assessment names must be unique inside each category.' };
    }

    if (invalidScoreCount > 0) {
      return { valid: false, message: 'Fix scores that are invalid, negative, or above the max score.' };
    }

    return { valid: true, columns: normalizedColumns };
  };

  const saveAssessmentDefinitions = async (columns) => {
    const payload = columns.map(column => ({
      id: column.assessment_id,
      client_key: column.key,
      category: column.category,
      component_name: formatComponentName(column.period, column.clean_name),
      max_score: column.max_score,
    }));

    const response = await api.put(`/grades/class/${classId}/assessments`, {
      assessments: payload,
      delete_ids: deletedAssessmentIds,
    });

    const savedByClientKey = new Map(
      ensureArray(response.data?.data?.assessments).map(item => [item.client_key, item])
    );

    setAssessmentColumns(current => current.map(column => {
      const saved = savedByClientKey.get(column.key);
      return saved?.id
        ? { ...column, assessment_id: saved.id, isDraft: false }
        : { ...column, isDraft: false };
    }));
    setDeletedAssessmentIds([]);
    setHasAssessmentDefinitionChanges(false);
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
      const hadAssessmentChanges = hasAssessmentDefinitionChanges || deletedAssessmentIds.length > 0;
      const nextComponentIds = {};
      const gradeUpdates = new Map();
      const errors = [];

      if (validation.columns.length || deletedAssessmentIds.length) {
        await saveAssessmentDefinitions(validation.columns);
      }

      if (!grades.length) {
        if (saveVersionRef.current === versionAtStart) {
          setHasUnsavedChanges(false);
          setSaveStatus('saved');
        } else {
          setSaveStatus('pending');
        }
        setLastSavedAt(new Date());
        if (!silent) showToast(hadAssessmentChanges ? 'Assessments saved successfully.' : 'No changes detected.');
        return true;
      }

      await Promise.all(grades.map(async student => {
        const enrollmentId = student.enrollment_id;

        // Only include components that have data (scores or are being created)
        const components = validation.columns
          .filter(column => {
            const scoreValue = scoreMatrix[enrollmentId]?.[column.key];
            const hasScore = scoreValue !== '' && scoreValue !== null && scoreValue !== undefined;
            const hasId = componentIdsByEnrollment[enrollmentId]?.[column.key];
            return hasScore || hasId || column.isDraft;
          })
          .map(column => {
            const componentId = componentIdsByEnrollment[enrollmentId]?.[column.key];
            const scoreValue = scoreMatrix[enrollmentId]?.[column.key];
            const payload = {
              category: column.category,
              component_name: formatComponentName(column.period, column.clean_name),
              max_score: column.max_score || 0,
              score: scoreValue === '' || scoreValue === null || scoreValue === undefined
                ? null
                : Number(scoreValue),
              force_create: column.isDraft && !componentId, // Force creation for new draft assessments
            };

            if (componentId) payload.id = componentId;
            return payload;
          });

        try {
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

          nextComponentIds[enrollmentId] = { ...(componentIdsByEnrollment[enrollmentId] || {}) };
          validation.columns.forEach(column => {
            const expectedKey = assessmentKey(column.category, formatComponentName(column.period, column.clean_name));
            const returnedComponent = returnedComponents.get(expectedKey);
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
        } catch (error) {
          const studentName = `${student.last_name}, ${student.first_name}`;
          const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
          errors.push({ student: studentName, error: errorMsg });
          console.error(`Failed to save scores for ${studentName}:`, {
            error: errorMsg,
            fullError: error,
            response: error.response?.data
          });
        }
      }));

      if (errors.length > 0) {
        setSaveStatus('error');
        if (!silent) {
          console.error('Save errors:', errors);
          const errorDetails = errors.map(e => `${e.student}: ${e.error}`).join('\n');
          showToast(`Failed to save for ${errors.length} student(s). See console.`, 'error');
        }
        return false;
      }

      setComponentIdsByEnrollment(nextComponentIds);
      setDeletedComponentIdsByEnrollment({});

      // Update assessment columns to remove draft status
      setAssessmentColumns(columns =>
        columns.map(column => ({ ...column, isDraft: false }))
      );

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
        const hasNewAssessments = hadAssessmentChanges;
        const hasScoreChanges = changedCount > 0;

        let message = hasNewAssessments ? 'Assessments saved successfully.' : 'No changes detected.';
        if (changedCount > 0 || hasNewAssessments) {
          if (statusReset) {
            message = 'Changes saved. Final marks stay hidden until the class is verified again.';
          } else if (hasNewAssessments && hasScoreChanges) {
            message = 'Assessments created and scores saved successfully.';
          } else if (hasNewAssessments) {
            message = 'Assessments created successfully.';
          } else {
            message = 'Scores saved successfully.';
          }
        }

        showToast(message);
      }

      return true;
    } catch (error) {
      setSaveStatus('error');
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save score grid.';
      console.error('Save score grid error:', error);
      if (!silent) showToast(errorMessage, 'error');
      return false;
    } finally {
      setSavingScores(false);
    }
  };

  useEffect(() => {
    window.clearTimeout(autosaveTimerRef.current);

    if (!hasUnsavedChanges || savingScores) return undefined;
    if (!grades.length) return undefined;

    // Don't autosave if there are validation errors, but allow manual save
    if (invalidScoreCount > 0) {
      setSaveStatus('error');
      return undefined;
    }

    // Check if we have any assessments with scores or definition changes that need to be saved
    const hasScoresToSave = assessmentColumns.some(column => {
      return grades.some(student => {
        const value = scoreMatrix[student.enrollment_id]?.[column.key];
        return value !== '' && value !== null && value !== undefined;
      }) || column.isDraft || hasAssessmentDefinitionChanges;
    }) || deletedAssessmentIds.length > 0;

    if (!hasScoresToSave) {
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
    deletedAssessmentIds,
    hasAssessmentDefinitionChanges,
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

  const loadDailyAttendance = (date) => {
    const map = {};
    grades.forEach(student => {
      const record = ensureArray(student.attendance).find(r => r.attendance_date === date);
      map[student.enrollment_id] = record ? record.status : 'present';
    });
    setDailyAttendanceMap(map);
  };

  const openDailyAttendance = () => {
    const today = new Date().toISOString().slice(0, 10);
    setDailyAttendanceDate(today);
    // Auto-select period based on active tab, default to midterm
    setDailyAttendancePeriod(activeTab === 'final' ? 'final' : 'midterm');
    loadDailyAttendance(today);
    setShowDailyAttendance(true);
  };

  useEffect(() => {
    if (showDailyAttendance) {
      loadDailyAttendance(dailyAttendanceDate);
    }
  }, [dailyAttendanceDate, showDailyAttendance]);

  const markAllDailyAttendance = (status) => {
    const map = {};
    grades.forEach(student => {
      map[student.enrollment_id] = status;
    });
    setDailyAttendanceMap(map);
  };

  const dailyAttendanceStats = useMemo(() => {
    const total = grades.length;
    const present = grades.filter(student => dailyAttendanceMap[student.enrollment_id] === 'present').length;
    const absent = grades.filter(student => dailyAttendanceMap[student.enrollment_id] === 'absent').length;
    const unmarked = Math.max(0, total - present - absent);
    return { total, present, absent, unmarked };
  }, [dailyAttendanceMap, grades]);

  const saveDailyAttendance = async () => {
    if (!dailyAttendanceDate) return showToast('Please select a date', 'error');
    if (!dailyAttendancePeriod) return showToast('Please select a period (Midterm or Final)', 'error');

    // Check if this date already exists in attendance records
    const existingDate = attendanceDates.find(date => date === dailyAttendanceDate);
    if (existingDate) {
      // Check which period this date belongs to
      const existingPeriodGroup = attendanceDateGroups.find(group => 
        group.dates.includes(dailyAttendanceDate)
      );
      
      if (existingPeriodGroup && existingPeriodGroup.period !== dailyAttendancePeriod) {
        showToast(
          `This date is already assigned to ${existingPeriodGroup.period === 'midterm' ? 'Midterm' : 'Final'}. Please delete it first or choose a different date.`,
          'error'
        );
        return;
      }
    }

    setSavingDailyAttendance(true);
    try {
      await api.post('/grades/attendance/class', {
        class_id: classId,
        attendance_date: dailyAttendanceDate,
        period: dailyAttendancePeriod,
        attendance: grades.map(student => ({
          enrollment_id: student.enrollment_id,
          status: dailyAttendanceMap[student.enrollment_id] || 'absent',
        })),
      });

      showToast(`${dailyAttendancePeriod === 'midterm' ? 'Midterm' : 'Final'} attendance saved for ${grades.length} student(s).`);
      setShowDailyAttendance(false);
      fetchData();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to save class attendance.', 'error');
    } finally {
      setSavingDailyAttendance(false);
    }
  };

  const deleteAttendanceDate = async (date) => {
    if (!window.confirm(`Delete all attendance records for ${formatAttendanceDateLabel(date)}?\n\nThis will remove attendance for all ${grades.length} student(s) on this date.`)) {
      return;
    }

    setDeletingAttendanceDate(date);
    try {
      // Collect all attendance IDs for this date from all students
      const attendanceIdsToDelete = [];
      grades.forEach(student => {
        const record = ensureArray(student.attendance).find(r => r.attendance_date === date);
        if (record?.id) {
          attendanceIdsToDelete.push(record.id);
        }
      });

      if (attendanceIdsToDelete.length === 0) {
        showToast('No attendance records found for this date.', 'error');
        return;
      }

      // Delete attendance records via API
      await Promise.all(
        grades.map(student => {
          const record = ensureArray(student.attendance).find(r => r.attendance_date === date);
          if (record?.id) {
            return api.post('/grades/attendance', {
              enrollment_id: student.enrollment_id,
              attendance: [],
              delete_ids: [record.id],
            });
          }
          return Promise.resolve();
        })
      );

      showToast(`Attendance for ${formatAttendanceDateLabel(date)} deleted successfully.`);
      fetchData();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to delete attendance date.', 'error');
    } finally {
      setDeletingAttendanceDate(null);
    }
  };

  const computeAll = async () => {
    try {
      await api.post(`/grades/compute-class/${classId}`);
      setTermGradesUnlocked(true);
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
      if (status === 'faculty_verified' || status === 'officially_released') {
        setTermGradesUnlocked(true);
      } else if (status === 'draft') {
        setTermGradesUnlocked(false);
      }
      showToast(`Status: ${status.replace('_', ' ')}`);
      fetchData();
    } catch (error) {
      showToast(error.response?.data?.message || 'Error', 'error');
    }
  };

  const saveAttendanceWeight = async () => {
    const nextAttendanceWeight = Math.max(0, Math.min(Number(attendanceWeight) || 0, gradingWeights.project));
    if (nextAttendanceWeight !== Number(attendanceWeight)) {
      setAttendanceWeight(nextAttendanceWeight);
    }

    setSavingAttendanceWeight(true);
    try {
      await api.put(`/classes/${classId}`, { attendance_weight: nextAttendanceWeight });
      await api.post(`/grades/compute-class/${classId}`);
      
      // Update only the class data and grades without full reload
      const gradesResponse = await api.get(`/grades/class/${classId}`);
      const gradePayload = gradesResponse.data?.data;
      const students = ensureArray(Array.isArray(gradePayload) ? gradePayload : gradePayload?.students).map(normalizeGradeStudent);
      
      setGrades(students);
      setClassData(prev => prev ? { ...prev, attendance_weight: nextAttendanceWeight } : prev);
      setShowAttendanceSettings(false);
      showToast('Attendance weight updated successfully.');
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to update attendance weight.', 'error');
    } finally {
      setSavingAttendanceWeight(false);
    }
  };

  const attendanceStats = rows => {
    const safeRows = ensureArray(rows);
    const total = safeRows.length;
    const present = safeRows.filter(row => row.status === 'present').length;
    return { total, present, percentage: total ? Math.round((present / total) * 100) : null };
  };

  const visiblePeriods = activeTab === 'summary' ? [] : [activeTab];
  const visibleColumns = assessmentColumns.filter(c => visiblePeriods.includes(c.period));

  const visibleGroupedAssessments = useMemo(() => {
    const groups = [];
    visiblePeriods.forEach(period => {
      CATEGORY_ORDER.forEach(category => {
        const columns = visibleColumns.filter(c => c.period === period && c.category === category);
        if (columns.length > 0) {
          groups.push({
            id: `${period}-${category}`,
            period,
            category,
            columns
          });
        }
      });
    });
    return groups;
  }, [visibleColumns, visiblePeriods]);

  const showSummaryCols = activeTab === 'summary';
  const visibleColumnsByCategory = useMemo(() => ({
    major_exam: visibleColumns.filter(column => column.category === 'major_exam'),
    quiz: visibleColumns.filter(column => column.category === 'quiz'),
    project: visibleColumns.filter(column => column.category === 'project'),
  }), [visibleColumns]);
  const termRecordColumnCount = 2
    + visibleColumnsByCategory.project.length + 1
    + visibleColumnsByCategory.quiz.length + 1
    + visibleColumnsByCategory.major_exam.length + 1
    + 6;

  const shouldShowTermGrade = Boolean(classData && (classData.grade_status !== 'draft' || termGradesUnlocked));
  const examWeightPercent = gradingWeights.major_exam;
  const quizWeightPercent = gradingWeights.quiz;
  const performanceCategoryPercent = gradingWeights.project;
  const effectiveAttendanceWeight = Math.max(0, Math.min(Number(attendanceWeight) || 0, performanceCategoryPercent));
  const performanceTaskWeightPercent = Math.max(0, performanceCategoryPercent - effectiveAttendanceWeight);
  const attendanceSliderPercent = performanceCategoryPercent > 0
    ? (effectiveAttendanceWeight / performanceCategoryPercent) * 100
    : 0;

  const calculateTermRecord = (student, period) => {
    const periodColumns = assessmentColumns.filter(column => column.period === period);
    const scoreFor = column => scoreMatrix[student.enrollment_id]?.[column.key];
    const categoryAverage = category => averageValues(
      periodColumns
        .filter(column => column.category === category)
        .map(column => transmutedScore(scoreFor(column), column.max_score))
    );

    // Calculate attendance using the formula: 50 + (Attendance Count / Total Meetings) × 50
    const attendanceRows = splitAttendanceRowsByTerm(student.attendance, assessmentColumns)[period] || [];
    const totalMeetings = attendanceRows.length;
    const attendanceCount = attendanceRows.filter(row => row.status === 'present').length;
    const attendanceGrade = totalMeetings > 0
      ? 50 + (attendanceCount / totalMeetings) * 50
      : null;

    const examAverage = categoryAverage('major_exam');
    const quizAverage = categoryAverage('quiz');
    const projectAverage = performanceTaskAverage(periodColumns, scoreFor);
    
    // Calculate the custom attendance weight as a decimal (e.g., 5% = 0.05, 2% = 0.02)
    const customAttendanceWeight = effectiveAttendanceWeight / 100;
    
    // Performance Task Weight = admin Performance Category weight - Attendance Weight
    const performanceTaskWeight = performanceTaskWeightPercent / 100;
    
    // Apply admin-configured weights for exam and quiz
    const examContribution = examAverage !== null ? examAverage * (examWeightPercent / 100) : null;
    const quizContribution = quizAverage !== null ? quizAverage * (quizWeightPercent / 100) : null;
    
    // Apply dynamic performance task weight (40% - attendance weight)
    const projectContribution = projectAverage !== null ? projectAverage * performanceTaskWeight : null;
    
    // Apply custom attendance weight (part of the 40% Performance Category)
    let attendanceContribution = null;
    if (attendanceGrade !== null && customAttendanceWeight > 0) {
      attendanceContribution = attendanceGrade * customAttendanceWeight;
    } else if (totalMeetings > 0 && customAttendanceWeight === 0) {
      // If attendance exists but weight is 0, show 0 instead of null
      attendanceContribution = 0;
    }
    
    // Calculate weighted score by summing all contributions
    const weightedScore = averageValues([
      examContribution,
      quizContribution,
      projectContribution,
      attendanceContribution,
    ]) === null
      ? null
      : [examContribution, quizContribution, projectContribution, attendanceContribution]
        .reduce((sum, value) => sum + (value ?? 0), 0);

    return {
      attendanceMeetings: totalMeetings,
      attendanceCount,
      attendanceGrade,
      examAverage,
      quizAverage,
      projectAverage,
      performanceTaskWeight,
      performanceTaskWeightPercent,
      examContribution,
      quizContribution,
      projectContribution,
      attendanceContribution,
      weightedScore,
      termGrade: mapPercentageToGrade(weightedScore),
    };
  };

  if (isLoading) {
    return <div className="empty-state">Loading class record...</div>;
  }

  if (loadError) {
    return (
      <div className="card" style={{ maxWidth: '720px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h2>Unable to open this class</h2>
          <p style={{ color: 'var(--text-secondary)' }}>{loadError}</p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/faculty/classes')}>
              <ArrowLeft size={16} />
              Back to Classes
            </button>
            <button className="btn btn-primary" onClick={fetchData}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  if (!classData) return <div className="empty-state">Class record not found.</div>;

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

      <div className="gradebook-toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={openEnroll}><UserPlus size={14} />Enroll</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowSetup(true)}><ClipboardCheck size={14} />Assessments</button>
          <button className="btn btn-secondary btn-sm" onClick={openDailyAttendance}><CalendarDays size={14} />Class Attendance</button>
          <button className="btn btn-secondary btn-sm" onClick={downloadClassRecord} disabled={exportingRecord || savingScores}>
            {exportingRecord ? <span className="spinner" /> : <Download size={14} />} Excel
          </button>
          <button className="btn btn-secondary btn-sm" onClick={computeAll}><Calculator size={14} />Compute</button>
          {classData.grade_status === 'draft' && <button className="btn btn-secondary btn-sm" onClick={() => updateStatus('faculty_verified')}><CheckCircle size={14} />Verify</button>}
          {classData.grade_status === 'faculty_verified' && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => updateStatus('draft')}><RotateCcw size={14} />Revert to Draft</button>
              <button className="btn btn-primary btn-sm" onClick={() => updateStatus('officially_released')}><Send size={14} />Release</button>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className={`gradebook-autosave-status ${saveStatusClass}`}>
            <span aria-hidden="true" />
            <strong>{saveStatusLabel}</strong>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => saveScoreGrid()} disabled={savingScores || invalidScoreCount > 0}>
            {savingScores ? <span className="spinner" /> : <Save size={14} />}
            {savingScores ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {!grades.length && (
        <div style={{ padding: '1rem', background: 'var(--accent-muted)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Info size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Getting Started</strong>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Click "Enroll" to add students, then "Assessments" to create quizzes, exams, and projects.</span>
          </div>
        </div>
      )}

      {grades.length > 0 && !assessmentColumns.length && (
        <div style={{ padding: '1rem', background: 'var(--accent-muted)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Info size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Setup Assessments</strong>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>You have {grades.length} student(s) enrolled. Click "Assessments" to add quizzes, exams, or performance tasks.</span>
          </div>
        </div>
      )}

      {grades.length > 0 && assessmentColumns.length > 0 && (
        <div className="gradebook-attendance-credit" role="status" aria-live="polite">
          <Info size={18} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <strong>Performance Category ({formatWeightPercent(performanceCategoryPercent)}%) = Performance Task ({formatWeightPercent(performanceTaskWeightPercent)}%) + Attendance ({formatWeightPercent(effectiveAttendanceWeight)}%)</strong>
            <span>Formula: ({formatWeightPercent(quizWeightPercent)}% Quiz) + ({formatWeightPercent(examWeightPercent)}% Exam) + ({formatWeightPercent(performanceTaskWeightPercent)}% PT) + ({formatWeightPercent(effectiveAttendanceWeight)}% Attendance). Attendance Grade = 50 + (Present / Total) x 50</span>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowAttendanceSettings(true)}
            style={{ flexShrink: 0, marginLeft: '0.5rem' }}
          >
            Customize
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
        <button className={`btn btn-sm ${activeTab === 'midterm' ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1, padding: '0.6rem', fontWeight: 600, border: activeTab !== 'midterm' ? '1px solid var(--border)' : 'none' }} onClick={() => setActiveTab('midterm')}>Midterm Record</button>
        <button className={`btn btn-sm ${activeTab === 'final' ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1, padding: '0.6rem', fontWeight: 600, border: activeTab !== 'final' ? '1px solid var(--border)' : 'none' }} onClick={() => setActiveTab('final')}>Final Record</button>
        <button className={`btn btn-sm ${activeTab === 'summary' ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1, padding: '0.6rem', fontWeight: 600, border: activeTab !== 'summary' ? '1px solid var(--border)' : 'none' }} onClick={() => setActiveTab('summary')}>Attendance & Summary</button>
      </div>

      <div className="table-container gradebook-table-container">
        {!visibleColumns.length && grades.length > 0 && activeTab !== 'summary' ? (
          <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
            <ClipboardCheck size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
            <h3 style={{ marginBottom: '0.5rem' }}>No Assessments Available</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Add assessments now to start encoding {PERIOD_LABELS[activeTab]} scores.</p>
            <button className="btn btn-primary" onClick={() => setShowSetup(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <ClipboardCheck size={16} /> Add Assessment Now
            </button>
          </div>
        ) : !assessmentColumns.length && grades.length > 0 && activeTab !== 'summary' ? (
          <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
            <ClipboardCheck size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
            <h3 style={{ marginBottom: '0.5rem' }}>No Assessments Available</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Add assessments now to start building this class record.</p>
            <button className="btn btn-primary" onClick={() => setShowSetup(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <ClipboardCheck size={16} /> Add Assessment Now
            </button>
          </div>
        ) : (
        <table className="gradebook-table gradebook-record-table" style={{ minWidth: `${showSummaryCols ? 300 + (visibleColumns.length * 132) + attendanceDates.length * 70 + 320 : 260 + (termRecordColumnCount * 82)}px` }}>
          <thead>
            {!showSummaryCols ? (
              <>
                <tr className="gradebook-group-row">
                  <th rowSpan={3} className="gradebook-student-col">Student</th>
                  <th colSpan={termRecordColumnCount} className="gradebook-period-header gradebook-record-term">
                    {PERIOD_LABELS[activeTab]}
                  </th>
                </tr>
                <tr className="gradebook-group-row">
                  <th colSpan={2} className="gradebook-category gradebook-category-attendance">Attendance</th>
                  <th colSpan={visibleColumnsByCategory.project.length + 1} className="gradebook-category gradebook-category-project">Performance ({formatWeightPercent(performanceCategoryPercent)}%: PT + AT)</th>
                  <th colSpan={visibleColumnsByCategory.quiz.length + 1} className="gradebook-category gradebook-category-quiz">Quiz ({formatWeightPercent(quizWeightPercent)}%)</th>
                  <th colSpan={visibleColumnsByCategory.major_exam.length + 1} className="gradebook-category gradebook-category-major_exam">{activeTab === 'midterm' ? 'Mid Ex' : 'Final Ex'} ({formatWeightPercent(examWeightPercent)}%)</th>
                  <th colSpan={6} className="gradebook-category gradebook-category-term-grade">{PERIOD_LABELS[activeTab]} Grade</th>
                </tr>
                <tr>
                  <th className="gradebook-assessment-header gradebook-record-summary-header">ATT</th>
                  <th className="gradebook-assessment-header gradebook-record-summary-header">GRD</th>
                  {visibleColumnsByCategory.project.map(column => (
                    <th key={column.key} className="gradebook-assessment-header">
                      <div className="gradebook-assessment-title">
                        <span>{column.clean_name || 'ACT'}</span>
                        <button type="button" className="gradebook-remove-assessment" onClick={() => removeAssessment(column.key)} aria-label={`Remove ${column.clean_name || 'assessment'}`}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <small>{column.max_score || 0} pts</small>
                    </th>
                  ))}
                  <th className="gradebook-assessment-header gradebook-record-summary-header">AVE</th>
                  {visibleColumnsByCategory.quiz.map(column => (
                    <th key={column.key} className="gradebook-assessment-header">
                      <div className="gradebook-assessment-title">
                        <span>{column.clean_name || 'Quiz'}</span>
                        <button type="button" className="gradebook-remove-assessment" onClick={() => removeAssessment(column.key)} aria-label={`Remove ${column.clean_name || 'assessment'}`}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <small>{column.max_score || 0} pts</small>
                    </th>
                  ))}
                  <th className="gradebook-assessment-header gradebook-record-summary-header">AVE</th>
                  {visibleColumnsByCategory.major_exam.map(column => (
                    <th key={column.key} className="gradebook-assessment-header">
                      <div className="gradebook-assessment-title">
                        <span>{column.clean_name || 'Exam'}</span>
                        <button type="button" className="gradebook-remove-assessment" onClick={() => removeAssessment(column.key)} aria-label={`Remove ${column.clean_name || 'assessment'}`}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <small>{column.max_score || 0} pts</small>
                    </th>
                  ))}
                  <th className="gradebook-assessment-header gradebook-record-summary-header">AVE</th>
                  <th className="gradebook-assessment-header gradebook-record-summary-header">{formatWeightPercent(performanceTaskWeightPercent)}%PT</th>
                  <th className="gradebook-assessment-header gradebook-record-summary-header">{formatWeightPercent(quizWeightPercent)}%Q</th>
                  <th className="gradebook-assessment-header gradebook-record-summary-header">{formatWeightPercent(examWeightPercent)}%ME</th>
                  <th className="gradebook-assessment-header gradebook-record-summary-header">{formatWeightPercent(effectiveAttendanceWeight)}%AT</th>
                  <th className="gradebook-assessment-header gradebook-record-grade-header">{TERM_GRADE_SHORT_LABELS[activeTab]}</th>
                  <th className="gradebook-assessment-header gradebook-record-grade-header">{TERM_GRADE_SHORT_LABELS[activeTab]}%</th>
                </tr>
              </>
            ) : (
              <>
                <tr className="gradebook-group-row">
                  <th rowSpan={4} className="gradebook-student-col">Student</th>
                  {attendanceDates.length > 0 && (
                    <th colSpan={attendanceDates.length} className="gradebook-period-header" style={{ textAlign: 'center', backgroundColor: 'var(--bg-elevated)', padding: '0.4rem', borderBottom: '1px solid var(--border)' }}>
                      ATTENDANCE
                    </th>
                  )}
                  <>
                    <th rowSpan={4} style={{ textAlign: 'center', verticalAlign: 'middle', padding: '0 1rem' }}>Weighted</th>
                    <th rowSpan={4} style={{ textAlign: 'center', verticalAlign: 'middle', padding: '0 1rem' }}>Grade</th>
                    <th rowSpan={4} style={{ textAlign: 'center', verticalAlign: 'middle', padding: '0 1rem' }}>Remarks</th>
                  </>
                </tr>
                <tr className="gradebook-group-row">
                  {attendanceDates.length > 0 && (
                    <th colSpan={attendanceDates.length} className="gradebook-category gradebook-category-project" style={{ textAlign: 'center' }}>
                      Detailed Attendance by Date
                    </th>
                  )}
                </tr>
                <tr>
                  {attendanceDateGroups.map(group => (
                    <th
                      key={group.period}
                      colSpan={group.dates.length}
                      className={`gradebook-category gradebook-category-${group.period === 'midterm' ? 'quiz' : 'major_exam'}`}
                      style={{ textAlign: 'center' }}
                    >
                      {group.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  {attendanceDateGroups.flatMap(group => group.dates).map(date => (
                    <th
                      key={date}
                      className="gradebook-assessment-header gradebook-attendance-date-header"
                      style={{ textAlign: 'center', padding: '0.5rem', minWidth: '70px', position: 'relative' }}
                    >
                      <div className="gradebook-assessment-title" style={{ justifyContent: 'center', flexDirection: 'column', gap: '0.25rem' }}>
                        <span 
                          style={{ cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px', color: 'var(--primary)', fontWeight: 600 }}
                          onClick={() => {
                            setDailyAttendanceDate(date);
                            loadDailyAttendance(date);
                            setShowDailyAttendance(true);
                          }}
                          title="Click to edit attendance for this date"
                        >
                          {formatAttendanceDateLabel(date)}
                        </span>
                        <button
                          type="button"
                          className="gradebook-delete-attendance-date"
                          onClick={() => deleteAttendanceDate(date)}
                          disabled={deletingAttendanceDate === date}
                          aria-label={`Delete attendance for ${formatAttendanceDateLabel(date)}`}
                          title="Delete this attendance date"
                        >
                          {deletingAttendanceDate === date ? (
                            <span className="spinner" style={{ width: '12px', height: '12px' }} />
                          ) : (
                            <Trash2 size={12} />
                          )}
                        </button>
                      </div>
                      <small>P/A</small>
                    </th>
                  ))}
                </tr>
              </>
            )}
          </thead>
          <tbody>
            {grades.map((student, index) => (
              <tr key={student.enrollment_id}>
                <td className="gradebook-student-col">
                  <div>
                    <div className="gradebook-student-name">{index + 1}. {student.last_name}, {student.first_name}</div>
                    <div className="gradebook-student-meta">{student.student_number || 'No student no.'} | {student.program || 'No program'}</div>
                  </div>
                </td>
                {!showSummaryCols && (() => {
                  const termRecord = calculateTermRecord(student, activeTab);
                  const renderScoreCells = columns => columns.map(column => {
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
                          aria-label={`${column.clean_name || 'Assessment'} score for ${student.last_name}, ${student.first_name}`}
                        />
                      </td>
                    );
                  });

                  return (
                    <>
                      <td
                        className="gradebook-record-value"
                        title={termRecord.attendanceMeetings > 0 ? `${termRecord.attendanceCount} present out of ${termRecord.attendanceMeetings} meeting(s)` : 'No attendance recorded'}
                      >
                        {termRecord.attendanceMeetings > 0 ? termRecord.attendanceCount : '--'}
                      </td>
                      <td className="gradebook-record-value gradebook-record-average">{formatRecordNumber(termRecord.attendanceGrade)}</td>
                      {renderScoreCells(visibleColumnsByCategory.project)}
                      <td className="gradebook-record-value gradebook-record-average">{formatRecordNumber(termRecord.projectAverage)}</td>
                      {renderScoreCells(visibleColumnsByCategory.quiz)}
                      <td className="gradebook-record-value gradebook-record-average">{formatRecordNumber(termRecord.quizAverage)}</td>
                      {renderScoreCells(visibleColumnsByCategory.major_exam)}
                      <td className="gradebook-record-value gradebook-record-average">{formatRecordNumber(termRecord.examAverage)}</td>
                      <td className="gradebook-record-value gradebook-record-weighted">{formatRecordNumber(termRecord.projectContribution)}</td>
                      <td className="gradebook-record-value gradebook-record-weighted">{formatRecordNumber(termRecord.quizContribution)}</td>
                      <td className="gradebook-record-value gradebook-record-weighted">{formatRecordNumber(termRecord.examContribution)}</td>
                      <td className="gradebook-record-value gradebook-record-weighted">{formatRecordNumber(termRecord.attendanceContribution)}</td>
                      <td className="gradebook-record-value gradebook-record-term-grade" style={{ color: shouldShowTermGrade ? getFinalGradeColor(termRecord.termGrade) : 'var(--text-muted)' }}>
                        {shouldShowTermGrade && termRecord.termGrade !== null ? termRecord.termGrade.toFixed(2) : '--'}
                      </td>
                      <td className="gradebook-record-value gradebook-record-term-grade" style={{ color: shouldShowTermGrade ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 600 }}>
                        {shouldShowTermGrade && termRecord.weightedScore !== null ? formatRecordNumber(termRecord.weightedScore) + '%' : '--'}
                      </td>
                    </>
                  );
                })()}

                {showSummaryCols && attendanceDates.map(date => {
                  const record = ensureArray(student.attendance).find(r => r.attendance_date === date);
                  let display = '-';
                  let color = 'var(--text-muted)';
                  if (record) {
                    if (record.status === 'present') { display = 'P'; color = 'var(--success)'; }
                    if (record.status === 'absent') { display = 'A'; color = 'var(--danger)'; }
                  }
                  return (
                    <td key={date} style={{ textAlign: 'center', fontWeight: 600, color, fontSize: '0.9rem' }}>
                      {display}
                    </td>
                  );
                })}

                {showSummaryCols && (
                  <>
                    <td style={{ fontWeight: 600, textAlign: 'center' }}>
                      {formatWeightedScore(student.grade?.weighted_score)
                        ? formatWeightedScore(student.grade?.weighted_score)
                        : <span style={{ color: 'var(--text-muted)' }}>Pending</span>}
                    </td>
                    <td style={{ fontWeight: 700, textAlign: 'center', color: getFinalGradeColor(student.grade?.final_grade) }}>
                      {student.grade?.final_grade ?? '-'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {student.grade?.remarks
                        ? <span className={`badge ${student.grade?.remarks === 'Passed' ? 'badge-success' : student.grade?.remarks === 'Failed' ? 'badge-danger' : 'badge-warning'}`}>{student.grade?.remarks}</span>
                        : <span className="badge badge-warning">Draft</span>}
                    </td>
                  </>
                )}
              </tr>
            ))}
            {!grades.length && <tr><td colSpan={showSummaryCols ? attendanceDates.length + 4 : termRecordColumnCount + 1} className="empty-state">No students enrolled</td></tr>}
          </tbody>
        </table>
        )}
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
              <button className="btn btn-secondary btn-sm" onClick={() => addAssessment('project')}><Plus size={14} />Add Performance Task</button>
            </div>

            <div className="gradebook-setup-list" style={{ marginTop: '0.5rem' }}>
              {assessmentColumns.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '110px 140px 1fr 100px 36px', gap: '0.75rem', padding: '0 0.5rem 0.25rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  <div>Period</div>
                  <div>Category</div>
                  <div>Assessment Name</div>
                  <div>Max Score</div>
                  <div></div>
                </div>
              )}
              {assessmentColumns.map(column => (
                <div key={column.key} className="gradebook-setup-row" style={{ opacity: column.isDraft ? 0.8 : 1, backgroundColor: column.isDraft ? 'var(--accent-muted)' : 'transparent' }}>
                  <select className="input-field" value={column.period} onChange={event => updateAssessment(column.key, 'period', event.target.value)}>
                    <option value="midterm">Midterm</option>
                    <option value="final">Final</option>
                  </select>
                  <select className="input-field" value={column.category} onChange={event => updateAssessment(column.key, 'category', event.target.value)}>
                    <option value="quiz">Quiz</option>
                    <option value="major_exam">Major Exam</option>
                    <option value="project">Perf. Task</option>
                  </select>
                  <input
                    className="input-field"
                    value={column.clean_name}
                    onChange={event => updateAssessment(column.key, 'clean_name', event.target.value)}
                    placeholder={column.isDraft ? "e.g. Quiz 1 (Draft - will be saved)" : "e.g. Quiz 1"}
                    style={{ fontStyle: column.isDraft ? 'italic' : 'normal' }}
                  />
                  <input type="number" min="1" className="input-field" value={column.max_score} onChange={event => updateAssessment(column.key, 'max_score', event.target.value)} placeholder="Pts" />
                  <button className="btn btn-ghost btn-sm" style={{ padding: '0', width: '36px', height: '36px', color: 'var(--danger)' }} onClick={() => removeAssessment(column.key)} aria-label="Remove assessment"><Trash2 size={16} /></button>
                </div>
              ))}
              {!assessmentColumns.length && <div className="empty-state" style={{ padding: '2rem' }}>No assessments yet. Add a quiz, exam, or performance task.</div>}
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '1rem' }}
              onClick={async () => {
                const saved = await saveScoreGrid();
                if (saved) setShowSetup(false);
              }}
              disabled={savingScores || invalidScoreCount > 0}
            >
              {savingScores ? 'Saving...' : 'Save Assessments'}
            </button>
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
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input className="input-field" style={{ flex: 1 }} placeholder="Search students..." value={searchStudent} onChange={event => setSearchStudent(event.target.value)} />
              <select className="input-field" style={{ width: '140px' }} value={filterProgram} onChange={event => setFilterProgram(event.target.value)}>
                <option value="">All Programs</option>
                <option value="BSCE">BSCE</option>
                <option value="BSEE">BSEE</option>
                <option value="BSCpE">BSCpE</option>
                <option value="BSME">BSME</option>
              </select>
            </div>
            <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {availableStudents.filter(student => {
                const matchesSearch = !searchStudent || `${student.first_name} ${student.last_name} ${student.student_id}`.toLowerCase().includes(searchStudent.toLowerCase());
                const matchesProgram = !filterProgram || student.program === filterProgram;
                return matchesSearch && matchesProgram;
              }).map(student => (
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

            <div style={{ padding: '1rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                <strong style={{ color: 'var(--text-primary)' }}>How to add attendance:</strong>
                <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', lineHeight: 1.6 }}>
                  <li>Click "Add Date" to create a new attendance entry</li>
                  <li>Select the date when class was held</li>
                  <li>Mark as Present (+1 point) or Absent (0 points)</li>
                  <li>Click "Save Attendance" when done</li>
                </ol>
              </div>
              {(() => {
                const stats = attendanceStats(attendance);
                return (
                  <div className="metric-strip" style={{ marginTop: '0.75rem' }}>
                    <div><strong>{stats.present}</strong><span>Present</span></div>
                    <div><strong>{stats.total - stats.present}</strong><span>Absent</span></div>
                    <div><strong>{stats.percentage ?? '-'}{stats.percentage != null ? '%' : ''}</strong><span>Rate</span></div>
                  </div>
                );
              })()}
            </div>

            <button className="btn btn-primary btn-sm" onClick={addAttendance} style={{ marginBottom: '0.75rem', width: '100%' }}><Plus size={14} /> Add Attendance Date</button>
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

      {showDailyAttendance && (
        <div className="modal-overlay" onClick={() => !savingDailyAttendance && setShowDailyAttendance(false)}>
          <div className="modal-content attendance-sheet-modal" onClick={event => event.stopPropagation()}>
            <div className="attendance-sheet-header">
              <div>
                <h2>Class Attendance</h2>
                <p className="gradebook-modal-note">Mark attendance for all students on a specific date</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowDailyAttendance(false)} disabled={savingDailyAttendance}><X size={18} /></button>
            </div>

            <div className="attendance-sheet-controls">
              <div className="attendance-control-row">
                <div className="attendance-period-selector">
                  <button
                    type="button"
                    className={`attendance-period-btn ${dailyAttendancePeriod === 'midterm' ? 'is-active is-midterm' : ''}`}
                    onClick={() => setDailyAttendancePeriod('midterm')}
                    disabled={savingDailyAttendance}
                  >
                    Midterm
                  </button>
                  <button
                    type="button"
                    className={`attendance-period-btn ${dailyAttendancePeriod === 'final' ? 'is-active is-final' : ''}`}
                    onClick={() => setDailyAttendancePeriod('final')}
                    disabled={savingDailyAttendance}
                  >
                    Final
                  </button>
                </div>

                <label className="attendance-date-field">
                  <span>Class Date</span>
                  <input
                    type="date"
                    className="input-field"
                    value={dailyAttendanceDate}
                    onChange={e => setDailyAttendanceDate(e.target.value)}
                    disabled={savingDailyAttendance}
                  />
                </label>
              </div>

              <div className="attendance-quick-actions">
                <button 
                  className="btn btn-ghost btn-sm" 
                  onClick={() => markAllDailyAttendance('present')} 
                  disabled={savingDailyAttendance || !grades.length}
                  style={{ color: 'var(--success)' }}
                >
                  <CheckCircle size={16} /> Mark All Present
                </button>
                <button 
                  className="btn btn-ghost btn-sm" 
                  onClick={() => markAllDailyAttendance('absent')} 
                  disabled={savingDailyAttendance || !grades.length}
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X size={16} /> Mark All Absent
                </button>
              </div>
            </div>

            <div className={`attendance-sheet-summary attendance-summary-${dailyAttendancePeriod}`}>
              <div className="attendance-summary-main">
                <div className="attendance-summary-count">
                  <span className="count-number">{dailyAttendanceStats.present}</span>
                  <span className="count-label">Present</span>
                </div>
                <div className="attendance-summary-divider">/</div>
                <div className="attendance-summary-count">
                  <span className="count-number">{dailyAttendanceStats.total}</span>
                  <span className="count-label">Total</span>
                </div>
              </div>
              <div className="attendance-summary-badge">
                {dailyAttendancePeriod === 'midterm' ? 'Midterm Period' : 'Final Period'}
              </div>
            </div>

            <div className="attendance-sheet-list">
              {grades.map((student, index) => {
                const status = dailyAttendanceMap[student.enrollment_id];
                return (
                  <div key={student.enrollment_id} className={`attendance-sheet-row attendance-row-${status || 'unmarked'}`}>
                    <div className="attendance-student-info">
                      <div className="student-number">{index + 1}</div>
                      <div className="student-details">
                        <div className="student-name">{student.last_name}, {student.first_name}</div>
                        <div className="student-meta">{student.student_number || 'No ID'} • {student.program || 'No Program'}</div>
                      </div>
                    </div>

                    <div className="attendance-actions">
                      <button
                        type="button"
                        className={`attendance-btn attendance-btn-present ${status === 'present' ? 'is-active' : ''}`}
                        onClick={() => setDailyAttendanceMap(prev => ({ ...prev, [student.enrollment_id]: 'present' }))}
                        disabled={savingDailyAttendance}
                      >
                        <CheckCircle size={16} />
                        <span>Present</span>
                      </button>
                      <button
                        type="button"
                        className={`attendance-btn attendance-btn-absent ${status === 'absent' ? 'is-active' : ''}`}
                        onClick={() => setDailyAttendanceMap(prev => ({ ...prev, [student.enrollment_id]: 'absent' }))}
                        disabled={savingDailyAttendance}
                      >
                        <X size={16} />
                        <span>Absent</span>
                      </button>
                    </div>
                  </div>
                );
              })}
              {!grades.length && <div className="empty-state" style={{ padding: '3rem' }}>No students enrolled in this class.</div>}
            </div>

            <div className="attendance-sheet-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowDailyAttendance(false)}
                disabled={savingDailyAttendance}
              >
                Cancel
              </button>
              <button
                className={`btn btn-primary attendance-save-btn-${dailyAttendancePeriod}`}
                onClick={saveDailyAttendance}
                disabled={savingDailyAttendance || !grades.length || !dailyAttendanceDate || !dailyAttendancePeriod}
              >
                {savingDailyAttendance ? (
                  <><span className="spinner" style={{ width: '14px', height: '14px' }} /> Saving...</>
                ) : (
                  <><Save size={16} /> Save Attendance</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAttendanceSettings && (
        <div className="modal-overlay" onClick={() => !savingAttendanceWeight && setShowAttendanceSettings(false)}>
          <div className="modal-content" onClick={event => event.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ marginBottom: '0.5rem' }}>Attendance Weight (Inside Performance Category)</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>Set attendance weight. Performance Task weight will auto-adjust to maintain the admin-configured performance category.</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAttendanceSettings(false)} disabled={savingAttendanceWeight}><X size={18} /></button>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <label htmlFor="attendance-weight-slider" style={{ fontWeight: 600, fontSize: '0.9rem' }}>Attendance Weight (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input
                    type="number"
                    min="0"
                    max={performanceCategoryPercent}
                    step="1"
                    value={effectiveAttendanceWeight}
                    onChange={e => setAttendanceWeight(Math.max(0, Math.min(performanceCategoryPercent, Number(e.target.value))))}
                    className="input-field"
                    style={{ width: '80px', textAlign: 'center', padding: '0.5rem' }}
                    disabled={savingAttendanceWeight}
                  />
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)', minWidth: '60px' }}>{formatWeightPercent(effectiveAttendanceWeight)}%</span>
                </div>
              </div>

              <input
                id="attendance-weight-slider"
                type="range"
                min="0"
                max={performanceCategoryPercent}
                step="1"
                value={effectiveAttendanceWeight}
                onChange={e => setAttendanceWeight(Number(e.target.value))}
                disabled={savingAttendanceWeight}
                style={{
                  width: '100%',
                  height: '8px',
                  borderRadius: '4px',
                  background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${attendanceSliderPercent}%, var(--bg-elevated) ${attendanceSliderPercent}%, var(--bg-elevated) 100%)`,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span>0% (PT={formatWeightPercent(performanceCategoryPercent)}%)</span>
                <span>{formatWeightPercent(effectiveAttendanceWeight)}% (PT={formatWeightPercent(performanceTaskWeightPercent)}%)</span>
                <span>{formatWeightPercent(performanceCategoryPercent)}% (PT=0%)</span>
              </div>
            </div>

            <div style={{ padding: '1rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Current Breakdown:</strong>
                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  <li>Quiz: <strong>{formatWeightPercent(quizWeightPercent)}%</strong> (admin setting)</li>
                  <li>Exam: <strong>{formatWeightPercent(examWeightPercent)}%</strong> (admin setting)</li>
                  <li>Performance Task: <strong>{formatWeightPercent(performanceTaskWeightPercent)}%</strong> (auto-adjusted)</li>
                  <li>Attendance: <strong>{formatWeightPercent(effectiveAttendanceWeight)}%</strong> (customizable)</li>
                  <li style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>Configured Total: <strong>{formatWeightPercent(examWeightPercent + quizWeightPercent + performanceCategoryPercent)}%</strong></li>
                </ul>
                <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', fontStyle: 'italic' }}>Performance Category = PT ({formatWeightPercent(performanceTaskWeightPercent)}%) + Attendance ({formatWeightPercent(effectiveAttendanceWeight)}%) = {formatWeightPercent(performanceCategoryPercent)}%</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setShowAttendanceSettings(false)}
                disabled={savingAttendanceWeight}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={saveAttendanceWeight}
                disabled={savingAttendanceWeight}
              >
                {savingAttendanceWeight ? 'Saving...' : 'Save Weight'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
