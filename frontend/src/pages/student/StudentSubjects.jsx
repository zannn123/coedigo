import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { BookOpen, CalendarDays, ChevronDown, Percent, UserCheck } from 'lucide-react';

export default function StudentSubjects() {
  const [grades, setGrades] = useState([]);
  const [expandedSubject, setExpandedSubject] = useState(null);
  const [activeYear, setActiveYear] = useState(null);

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
  const categoryLabels = { major_exam: 'Major Exam', quiz: 'Quiz', project: 'Performance Tasks / Attendance' };

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

  useEffect(() => {
    if (academicYears.length > 0 && (!activeYear || !academicYears.find(y => y.year === activeYear))) {
      setActiveYear(academicYears[0].year);
    }
  }, [academicYears, activeYear]);
  const renderComponentSection = (components, title) => {
    if (!components.length) return null;
    return (
      <div className="detail-section" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Percent size={16} />{title}</h3>
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
              {components.map(component => {
                const percent = componentPercent(component);
                const cleanName = component.component_name.replace(/\[(Midterm|Final)\]\s*/i, '').trim();
                return (
                  <tr key={component.id}>
                    <td><span className="badge badge-accent">{categoryLabels[component.category] || component.category}</span></td>
                    <td style={{ fontWeight: 600 }}>{cleanName}</td>
                    <td>{component.score ?? '-'}</td>
                    <td>{component.max_score}</td>
                    <td>{percent != null ? `${percent}%` : '-'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{formatDateTime(component.updated_at || component.encoded_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="component-mobile-list">
          {components.map(component => {
            const percent = componentPercent(component);
            const cleanName = component.component_name.replace(/\[(Midterm|Final)\]\s*/i, '').trim();
            return (
              <div key={component.id} className="component-result-card">
                <div className="component-result-top">
                  <span className="badge badge-accent">{categoryLabels[component.category] || component.category}</span>
                  <strong>{cleanName}</strong>
                </div>
                <div className="component-score-grid">
                  <div><span>Score</span><strong>{component.score ?? '-'}</strong></div>
                  <div><span>Max</span><strong>{component.max_score}</strong></div>
                  <div><span>Percent</span><strong>{percent != null ? `${percent}%` : '-'}</strong></div>
                </div>
                <p>Updated {formatDateTime(component.updated_at || component.encoded_at)}</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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
            Scores refresh automatically. Final marks require faculty verification.
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
          <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
            {academicYears.map(yearGroup => (
              <button
                key={yearGroup.year}
                className={`btn btn-sm ${activeYear === yearGroup.year ? 'btn-primary' : 'btn-ghost'}`}
                style={{ whiteSpace: 'nowrap', fontWeight: 600, border: activeYear !== yearGroup.year ? '1px solid var(--border)' : 'none', padding: '0.5rem 1rem' }}
                onClick={() => setActiveYear(yearGroup.year)}
              >
                A.Y. {yearGroup.year}
              </button>
            ))}
          </div>

          {academicYears.filter(yg => yg.year === activeYear).map(yearGroup => (
            <section key={yearGroup.year} className="academic-year-section" style={{ border: 'none', padding: 0, background: 'transparent' }}>
              <div className="year-summary" style={{ marginBottom: '2rem', padding: '1rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
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
                        const isOpen = expandedSubject?.key === key;
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

                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                              <button
                                type="button"
                                className={`btn btn-sm ${isOpen && expandedSubject.tab === 'scores' ? 'btn-primary' : 'btn-ghost'} subject-toggle`}
                                onClick={() => setExpandedSubject(isOpen && expandedSubject.tab === 'scores' ? null : { key, tab: 'scores' })}
                                style={{ flex: 1, border: '1px solid var(--border)' }}
                              >
                                <Percent size={16} /> {isOpen && expandedSubject.tab === 'scores' ? 'Hide Scores' : 'View Scores'}
                              </button>
                              <button
                                type="button"
                                className={`btn btn-sm ${isOpen && expandedSubject.tab === 'attendance' ? 'btn-primary' : 'btn-ghost'} subject-toggle`}
                                onClick={() => setExpandedSubject(isOpen && expandedSubject.tab === 'attendance' ? null : { key, tab: 'attendance' })}
                                style={{ flex: 1, border: '1px solid var(--border)' }}
                              >
                                <UserCheck size={16} /> {isOpen && expandedSubject.tab === 'attendance' ? 'Hide Attendance' : 'View Attendance'}
                              </button>
                            </div>

                            {isOpen && (
                              <div className="subject-detail-panel" id={detailId(key)}>
                                {expandedSubject.tab === 'scores' && (() => {
                                  const midterms = (subject.components || []).filter(c => !c.component_name.toLowerCase().includes('[final]'));
                                  const finals = (subject.components || []).filter(c => c.component_name.toLowerCase().includes('[final]'));
                                  
                                  if (!midterms.length && !finals.length) {
                                    return (
                                      <div className="detail-section" style={{ marginBottom: '0' }}>
                                        <div className="empty-state" style={{ padding: '1rem' }}>No live scores encoded yet</div>
                                      </div>
                                    );
                                  }

                                  return (
                                    <>
                                      {renderComponentSection(midterms, 'Midterm Components')}
                                      {renderComponentSection(finals, 'Final Components')}
                                    </>
                                  );
                                })()}

                                {expandedSubject.tab === 'attendance' && (
                                  <div className="detail-section" style={{ marginBottom: '0' }}>
                                    {subject.attendance?.length ? (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {subject.attendance.map(row => (
                                          <div key={row.id} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.4rem', 
                                            padding: '0.25rem 0.6rem', 
                                            borderRadius: 'var(--radius-full)', 
                                            fontSize: '0.85rem', 
                                            background: row.status === 'present' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                                            border: `1px solid ${row.status === 'present' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                                            color: row.status === 'present' ? 'var(--success)' : 'var(--danger)'
                                          }}>
                                            <span style={{ fontSize: '1rem', lineHeight: 1 }}>{row.status === 'present' ? '●' : '○'}</span>
                                            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{formatDate(row.attendance_date)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="empty-state" style={{ padding: '1rem' }}>No attendance dates encoded yet</div>
                                    )}
                                  </div>
                                )}
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
