import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { BookOpen, CalendarDays, ChevronDown, Percent, UserCheck } from 'lucide-react';

export default function StudentSubjects() {
  const [grades, setGrades] = useState([]);
  const [expandedSubject, setExpandedSubject] = useState(null);

  useEffect(() => {
    let active = true;

    const loadGrades = () => {
      api.get('/grades/student')
        .then(r => {
          if (active) {
            setGrades(r.data.data || []);
          }
        })
        .catch(() => {});
    };

    loadGrades();
    const intervalId = window.setInterval(loadGrades, 15000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const statusBadge = {
    officially_released: 'badge-success',
    faculty_verified: 'badge-info',
    draft: 'badge-warning',
  };
  const categoryLabels = { major_exam: 'Major Exam', quiz: 'Quiz', project: 'Project / Attendance' };

  const numberValue = value => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const formatPercent = value => {
    const parsed = numberValue(value);
    return parsed != null ? `${parsed.toFixed(1)}%` : '-';
  };

  const formatGrade = value => {
    const parsed = numberValue(value);
    return parsed != null ? parsed.toFixed(2) : '-';
  };

  const formatPoints = value => {
    const parsed = numberValue(value);
    return parsed != null ? parsed.toFixed(0) : '0';
  };

  const statusLabel = status => status === 'officially_released' ? 'Released' : status === 'faculty_verified' ? 'Verified' : 'Pending';

  const formatDate = value => {
    if (!value) return '-';
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateTime = value => value
    ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '-';

  const componentPercent = component => {
    const score = numberValue(component.score);
    const max = numberValue(component.max_score);
    return score != null && max != null && max > 0 ? ((score / max) * 100).toFixed(1) : null;
  };

  const gradeColor = grade => {
    const value = numberValue(grade);
    if (value == null) return 'var(--text-muted)';
    return value <= 3 ? 'var(--success)' : 'var(--danger)';
  };

  const getSubjectKey = subject => String(
    subject.enrollment_id
    || subject.class_id
    || `${subject.subject_code}-${subject.section}-${subject.semester}-${subject.academic_year}`
  );

  const detailId = key => `subject-detail-${key.replace(/[^a-z0-9_-]/gi, '-')}`;

  const termRank = term => {
    const text = String(term || '').toLowerCase();
    if (text.includes('first') || text.includes('1')) return 1;
    if (text.includes('second') || text.includes('2')) return 2;
    if (text.includes('summer')) return 3;
    return 9;
  };

  const compareSubjects = (a, b) => {
    const codeCompare = String(a.subject_code || '').localeCompare(String(b.subject_code || ''), undefined, { numeric: true });
    if (codeCompare !== 0) return codeCompare;
    return String(a.subject_name || '').localeCompare(String(b.subject_name || ''));
  };

  const buildYearStats = subjects => {
    const presentPoints = subjects.reduce((total, subject) => total + (numberValue(subject.attendance_summary?.total_points) || 0), 0);
    const possiblePoints = subjects.reduce((total, subject) => total + (numberValue(subject.attendance_summary?.possible_points) || 0), 0);
    const gradeValues = subjects
      .map(subject => numberValue(subject.final_grade))
      .filter(value => value != null);
    const averageGrade = gradeValues.length
      ? gradeValues.reduce((total, value) => total + value, 0) / gradeValues.length
      : null;

    return {
      subjectCount: subjects.length,
      releasedCount: subjects.filter(subject => ['officially_released', 'faculty_verified'].includes(subject.grade_status)).length,
      presentPoints,
      possiblePoints,
      averageGrade,
    };
  };

  const academicYears = useMemo(() => {
    const grouped = grades.reduce((years, subject) => {
      const year = subject.academic_year || 'Unassigned Academic Year';
      const term = subject.semester || 'Unassigned Term';

      if (!years[year]) years[year] = {};
      if (!years[year][term]) years[year][term] = [];
      years[year][term].push(subject);
      return years;
    }, {});

    return Object.entries(grouped)
      .map(([year, terms]) => {
        const subjects = Object.values(terms).flat();
        return {
          year,
          stats: buildYearStats(subjects),
          terms: Object.entries(terms)
            .map(([term, termSubjects]) => ({
              term,
              subjects: [...termSubjects].sort(compareSubjects),
            }))
            .sort((a, b) => termRank(a.term) - termRank(b.term) || a.term.localeCompare(b.term)),
        };
      })
      .sort((a, b) => {
        if (a.year === 'Unassigned Academic Year') return 1;
        if (b.year === 'Unassigned Academic Year') return -1;
        return b.year.localeCompare(a.year, undefined, { numeric: true });
      });
  }, [grades]);

  return (
    <div className="animate-in student-subjects-page">
      <div className="page-header">
        <h1>My Subjects</h1>
        <p>Live score components, verification status, and attendance records</p>
      </div>

      <div className="subjects-overview">
        <div className="subjects-overview-title">
          <span><BookOpen size={16} /> Academic Records</span>
          <h2>{grades.length} Enrolled Subject{grades.length === 1 ? '' : 's'}</h2>
          <p style={{ margin: '0.5rem 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Component scores refresh automatically. Final marks appear only after faculty verification.
          </p>
        </div>
        <div className="subjects-overview-metrics">
          <div>
            <strong>{academicYears.length}</strong>
            <span>Academic Years</span>
          </div>
          <div>
            <strong>{grades.filter(g => ['officially_released', 'faculty_verified'].includes(g.grade_status)).length}</strong>
            <span>With Grades</span>
          </div>
        </div>
      </div>

      {!grades.length ? (
        <div className="card empty-state">No subjects available yet</div>
      ) : (
        <div className="academic-year-stack">
          {academicYears.map(yearGroup => (
            <section key={yearGroup.year} className="academic-year-section">
              <div className="academic-year-header">
                <div>
                  <span>Academic Year</span>
                  <h2>{yearGroup.year}</h2>
                </div>
                <div className="year-summary">
                  <div>
                    <strong>{yearGroup.stats.subjectCount}</strong>
                    <span>Subjects</span>
                  </div>
                  <div>
                    <strong>{yearGroup.stats.releasedCount}</strong>
                    <span>With Grades</span>
                  </div>
                  <div>
                    <strong>{yearGroup.stats.averageGrade != null ? yearGroup.stats.averageGrade.toFixed(2) : '-'}</strong>
                    <span>Avg Grade</span>
                  </div>
                  <div>
                    <strong>{formatPoints(yearGroup.stats.presentPoints)}/{formatPoints(yearGroup.stats.possiblePoints)}</strong>
                    <span>Attendance Pts</span>
                  </div>
                </div>
              </div>

              <div className="term-stack">
                {yearGroup.terms.map(termGroup => (
                  <div key={`${yearGroup.year}-${termGroup.term}`} className="term-group">
                    <div className="term-header">
                      <div>
                        <h3>{termGroup.term}</h3>
                        <span>{termGroup.subjects.length} Subject{termGroup.subjects.length === 1 ? '' : 's'}</span>
                      </div>
                    </div>

                    <div className="subject-card-list">
                      {termGroup.subjects.map(subject => {
                        const key = getSubjectKey(subject);
                        const isOpen = expandedSubject === key;
                        const canViewFinalGrade = subject.can_view_final_grade ?? subject.grade_status !== 'draft';
                        const attendanceTotal = numberValue(subject.attendance_summary?.total_points);
                        const attendancePossible = numberValue(subject.attendance_summary?.possible_points);

                        return (
                          <article key={key} className={`subject-summary-card ${isOpen ? 'is-open' : ''}`}>
                            <div className="subject-summary-top">
                              <div className="subject-title-block">
                                <span className="subject-code">{subject.subject_code || 'Subject'}</span>
                                <h3>{subject.subject_name || '-'}</h3>
                                <p>{[subject.section, subject.faculty_name].filter(Boolean).join(' | ') || '-'}</p>
                              </div>
                              <span className={`badge ${statusBadge[subject.grade_status] || 'badge-warning'}`}>
                                {statusLabel(subject.grade_status)}
                              </span>
                            </div>

                            <div className="subject-kpi-strip">
                              <div>
                                <span>Weighted</span>
                                <strong>{canViewFinalGrade ? formatPercent(subject.weighted_score) : 'Pending'}</strong>
                              </div>
                              <div>
                                <span>Final Grade</span>
                                <strong style={{ color: canViewFinalGrade ? gradeColor(subject.final_grade) : 'var(--text-muted)' }}>
                                  {canViewFinalGrade ? formatGrade(subject.final_grade) : 'Pending'}
                                </strong>
                              </div>
                              <div>
                                <span>Attendance</span>
                                <strong>
                                  {attendancePossible
                                    ? `${formatPoints(attendanceTotal)}/${formatPoints(attendancePossible)} pts`
                                    : '-'}
                                </strong>
                              </div>
                              <div>
                                <span>Rate</span>
                                <strong>{formatPercent(subject.attendance_summary?.percentage)}</strong>
                              </div>
                            </div>

                            <button
                              type="button"
                              className="btn btn-secondary btn-sm subject-toggle"
                              onClick={() => setExpandedSubject(isOpen ? null : key)}
                              aria-expanded={isOpen}
                              aria-controls={detailId(key)}
                            >
                              <span>{isOpen ? 'Hide Details' : 'View Details'}</span>
                              <ChevronDown size={16} className={isOpen ? 'is-open' : ''} />
                            </button>

                            {isOpen && (
                              <div className="subject-detail-panel" id={detailId(key)}>
                                {!canViewFinalGrade && (
                                  <div style={{ marginBottom:'1rem', padding:'0.875rem 1rem', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', background:'var(--bg-surface)', color:'var(--text-secondary)' }}>
                                    Your faculty has encoded live score details for this subject. Final grade, remarks, and weighted totals will appear after the class is marked as verified.
                                  </div>
                                )}

                                <div className="metric-strip">
                                  <div><strong>{formatPercent(subject.major_exam_avg)}</strong><span>Major Exams</span></div>
                                  <div><strong>{formatPercent(subject.quiz_avg)}</strong><span>Quizzes</span></div>
                                  <div><strong>{formatPercent(subject.project_avg)}</strong><span>Projects / Attendance</span></div>
                                  <div>
                                    <strong style={{ color: canViewFinalGrade ? gradeColor(subject.final_grade) : 'var(--text-muted)' }}>
                                      {canViewFinalGrade ? formatGrade(subject.final_grade) : 'Pending'}
                                    </strong>
                                    <span>Final Grade</span>
                                  </div>
                                </div>

                                <div className="detail-section">
                                  <h3><Percent size={16} />Encoded Grade Components</h3>
                                  <div className="table-container compact-table component-table-wrap">
                                    <table>
                                      <thead>
                                        <tr>
                                          <th>Type</th>
                                          <th>Component</th>
                                          <th>Score</th>
                                          <th>Max</th>
                                          <th>Percent</th>
                                          <th>Updated</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(subject.components || []).map(component => {
                                          const percent = componentPercent(component);
                                          return (
                                            <tr key={component.id}>
                                              <td><span className="badge badge-accent">{categoryLabels[component.category] || component.category}</span></td>
                                              <td style={{ fontWeight: 600 }}>{component.component_name}</td>
                                              <td>{component.score ?? '-'}</td>
                                              <td>{component.max_score}</td>
                                              <td>{percent != null ? `${percent}%` : '-'}</td>
                                              <td style={{ color: 'var(--text-secondary)' }}>{formatDateTime(component.updated_at || component.encoded_at)}</td>
                                            </tr>
                                          );
                                        })}
                                        {!subject.components?.length && <tr><td colSpan={6} className="empty-state">No live scores encoded yet</td></tr>}
                                      </tbody>
                                    </table>
                                  </div>
                                  <div className="component-mobile-list">
                                    {(subject.components || []).map(component => {
                                      const percent = componentPercent(component);
                                      return (
                                        <div key={component.id} className="component-result-card">
                                          <div className="component-result-top">
                                            <span className="badge badge-accent">{categoryLabels[component.category] || component.category}</span>
                                            <strong>{component.component_name}</strong>
                                          </div>
                                          <div className="component-score-grid">
                                            <div>
                                              <span>Score</span>
                                              <strong>{component.score ?? '-'}</strong>
                                            </div>
                                            <div>
                                              <span>Max</span>
                                              <strong>{component.max_score}</strong>
                                            </div>
                                            <div>
                                              <span>Percent</span>
                                              <strong>{percent != null ? `${percent}%` : '-'}</strong>
                                            </div>
                                          </div>
                                          <p>Updated {formatDateTime(component.updated_at || component.encoded_at)}</p>
                                        </div>
                                      );
                                    })}
                                    {!subject.components?.length && (
                                      <div className="empty-state" style={{ padding: '1rem' }}>No live scores encoded yet</div>
                                    )}
                                  </div>
                                </div>

                                <div className="detail-section">
                                  <h3><UserCheck size={16} />Attendance</h3>
                                  <div className="metric-strip">
                                    <div><strong>{formatPoints(subject.attendance_summary?.total_points)}</strong><span>Present Points</span></div>
                                    <div><strong>{formatPoints(subject.attendance_summary?.possible_points)}</strong><span>Class Dates</span></div>
                                    <div><strong>{formatPercent(subject.attendance_summary?.percentage)}</strong><span>Attendance Rate</span></div>
                                  </div>
                                  <h3><CalendarDays size={16} />Attendance Dates</h3>
                                  {subject.attendance?.length ? (
                                    <div className="attendance-date-grid">
                                      {subject.attendance.map(row => (
                                        <div key={row.id} className={`attendance-date-pill ${row.status === 'present' ? 'is-present' : 'is-absent'}`}>
                                          <span>{formatDate(row.attendance_date)}</span>
                                          <strong>{row.status === 'present' ? '+1 pt' : '0 pt'}</strong>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="empty-state" style={{ padding: '1rem' }}>No attendance dates encoded yet</div>
                                  )}
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
