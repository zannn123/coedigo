import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, Search, X } from 'lucide-react';
import './StudentSubjects.css';

export default function StudentSubjects() {
  const [grades, setGrades] = useState([]);
  const [expandedSubject, setExpandedSubject] = useState(null);
  const [activeYear, setActiveYear] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  const numberValue = value => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const formatPercent = value => {
    const parsed = numberValue(value);
    return parsed != null ? `${parsed.toFixed(1)}%` : '—';
  };

  const formatGrade = value => {
    const parsed = numberValue(value);
    return parsed != null ? parsed.toFixed(2) : '—';
  };

  const formatPoints = value => {
    const parsed = numberValue(value);
    return parsed != null ? parsed.toFixed(0) : '0';
  };

  const statusLabel = status =>
    status === 'officially_released' ? 'Released' :
    status === 'faculty_verified' ? 'Verified' : 'Pending';

  const statusClass = status =>
    status === 'officially_released' ? 'status-released' :
    status === 'faculty_verified' ? 'status-verified' : 'status-pending';

  const gradeColor = grade => {
    const value = numberValue(grade);
    if (value == null) return '';
    if (value <= 1.5) return 'grade-excellent';
    if (value <= 2.0) return 'grade-good';
    if (value <= 3.0) return 'grade-pass';
    return 'grade-fail';
  };

  const gradeLabel = grade => {
    const value = numberValue(grade);
    if (value == null) return '';
    if (value <= 1.5) return 'Excellent';
    if (value <= 2.0) return 'Very Good';
    if (value <= 3.0) return 'Passed';
    return 'Failed';
  };

  const componentPercent = component => {
    const score = numberValue(component.score);
    const max = numberValue(component.max_score);
    return score != null && max != null && max > 0 ? ((score / max) * 100).toFixed(1) : null;
  };

  const formatDate = value => {
    if (!value) return '—';
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const categoryLabels = { major_exam: 'Exam', quiz: 'Quiz', project: 'Task' };

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

  const getSubjectKey = subject => String(
    subject.enrollment_id
    || subject.class_id
    || `${subject.subject_code}-${subject.section}-${subject.semester}-${subject.academic_year}`
  );

  const academicYears = useMemo(() => {
    const grouped = grades.reduce((years, subject) => {
      const year = subject.academic_year || 'Unassigned';
      const term = subject.semester || 'Unassigned';

      if (!years[year]) years[year] = {};
      if (!years[year][term]) years[year][term] = [];
      years[year][term].push(subject);
      return years;
    }, {});

    return Object.entries(grouped)
      .map(([year, terms]) => ({
        year,
        terms: Object.entries(terms)
          .map(([term, termSubjects]) => ({
            term,
            subjects: [...termSubjects].sort(compareSubjects),
          }))
          .sort((a, b) => termRank(a.term) - termRank(b.term) || a.term.localeCompare(b.term)),
      }))
      .sort((a, b) => {
        if (a.year === 'Unassigned') return 1;
        if (b.year === 'Unassigned') return -1;
        return b.year.localeCompare(a.year, undefined, { numeric: true });
      });
  }, [grades]);

  useEffect(() => {
    if (academicYears.length > 0 && (!activeYear || !academicYears.find(y => y.year === activeYear))) {
      setActiveYear(academicYears[0].year);
    }
  }, [academicYears, activeYear]);

  const filterSubjects = (subjects) => {
    if (!searchQuery.trim()) return subjects;
    const q = searchQuery.toLowerCase();
    return subjects.filter(s =>
      (s.subject_code || '').toLowerCase().includes(q) ||
      (s.subject_name || '').toLowerCase().includes(q) ||
      (s.faculty_name || '').toLowerCase().includes(q)
    );
  };

  const activeYearData = academicYears.find(y => y.year === activeYear);

  const toggleExpand = (key) => {
    setExpandedSubject(prev => prev === key ? null : key);
  };

  return (
    <div className="animate-in ss-page">
      {/* Year Tabs */}
      {grades.length > 0 && (
        <div className="ss-year-tabs">
          {academicYears.map(yg => (
            <button
              key={yg.year}
              className={`ss-year-tab ${activeYear === yg.year ? 'active' : ''}`}
              onClick={() => setActiveYear(yg.year)}
            >
              {yg.year}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      {grades.length > 4 && (
        <div className="ss-search">
          <Search size={16} className="ss-search-icon" />
          <input
            type="text"
            placeholder="Search subjects..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="ss-search-input"
          />
          {searchQuery && (
            <button className="ss-search-clear" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {!grades.length ? (
        <div className="ss-empty">
          <p>No subjects enrolled yet</p>
        </div>
      ) : activeYearData ? (
        <div className="ss-terms-stack">
          {activeYearData.terms.map(termGroup => {
            const filteredSubjects = filterSubjects(termGroup.subjects);
            if (!filteredSubjects.length && searchQuery) return null;

            return (
              <section key={`${activeYearData.year}-${termGroup.term}`} className="ss-term-section">
                <div className="ss-term-label">
                  <span>{termGroup.term}</span>
                  <span className="ss-term-count">{filteredSubjects.length} subject{filteredSubjects.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="ss-subject-list">
                  {filteredSubjects.map(subject => {
                    const key = getSubjectKey(subject);
                    const isOpen = expandedSubject === key;
                    const canViewFinal = subject.can_view_final_grade ?? subject.grade_status !== 'draft';
                    const attendTotal = numberValue(subject.attendance_summary?.total_points);
                    const attendPossible = numberValue(subject.attendance_summary?.possible_points);
                    const attendPct = attendPossible > 0 ? ((attendTotal / attendPossible) * 100) : null;

                    const midterms = (subject.components || []).filter(c => !c.component_name.toLowerCase().includes('[final]'));
                    const finals = (subject.components || []).filter(c => c.component_name.toLowerCase().includes('[final]'));

                    return (
                      <article key={key} className={`ss-card ${isOpen ? 'is-expanded' : ''}`}>
                        {/* Card Header */}
                        <div className="ss-card-header" onClick={() => toggleExpand(key)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && toggleExpand(key)}>
                          <div className="ss-card-left">
                            <div className="ss-subject-id">{subject.subject_code || 'N/A'}</div>
                            <div className="ss-subject-info">
                              <h3>{subject.subject_name || '—'}</h3>
                              <p>{[subject.section, subject.faculty_name].filter(Boolean).join(' · ') || '—'}</p>
                            </div>
                          </div>
                          <div className="ss-card-right">
                            <span className={`ss-status ${statusClass(subject.grade_status)}`}>
                              {statusLabel(subject.grade_status)}
                            </span>
                            <span className="ss-expand-icon">
                              {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </span>
                          </div>
                        </div>

                        {/* Inline Metrics Strip */}
                        <div className="ss-metrics">
                          {/* Midterm */}
                          <div className="ss-metric">
                            <span className="ss-metric-label">Midterm</span>
                            <span className="ss-metric-value">
                              {midterms.length > 0
                                ? (() => {
                                    const scored = midterms.filter(c => c.score != null);
                                    if (!scored.length) return '—';
                                    const totalScore = scored.reduce((s, c) => s + parseFloat(c.score), 0);
                                    const totalMax = scored.reduce((s, c) => s + parseFloat(c.max_score), 0);
                                    return totalMax > 0 ? `${((totalScore / totalMax) * 100).toFixed(0)}%` : '—';
                                  })()
                                : '—'}
                            </span>
                          </div>
                          {/* Final */}
                          <div className="ss-metric">
                            <span className="ss-metric-label">Final</span>
                            <span className="ss-metric-value">
                              {finals.length > 0
                                ? (() => {
                                    const scored = finals.filter(c => c.score != null);
                                    if (!scored.length) return '—';
                                    const totalScore = scored.reduce((s, c) => s + parseFloat(c.score), 0);
                                    const totalMax = scored.reduce((s, c) => s + parseFloat(c.max_score), 0);
                                    return totalMax > 0 ? `${((totalScore / totalMax) * 100).toFixed(0)}%` : '—';
                                  })()
                                : '—'}
                            </span>
                          </div>
                          {/* Final Grade */}
                          <div className="ss-metric ss-metric-grade">
                            <span className="ss-metric-label">Grade</span>
                            <span className={`ss-metric-value ${canViewFinal ? gradeColor(subject.final_grade) : ''}`}>
                              {canViewFinal ? formatGrade(subject.final_grade) : 'Pending'}
                            </span>
                            {canViewFinal && subject.final_grade && (
                              <span className={`ss-grade-tag ${gradeColor(subject.final_grade)}`}>
                                {gradeLabel(subject.final_grade)}
                              </span>
                            )}
                          </div>
                          {/* Attendance */}
                          <div className="ss-metric ss-metric-attend">
                            <span className="ss-metric-label">Attendance</span>
                            {attendPct != null ? (
                              <div className="ss-attend-bar-wrap">
                                <div className="ss-attend-bar">
                                  <div
                                    className={`ss-attend-fill ${attendPct >= 90 ? 'good' : attendPct >= 75 ? 'warning' : 'danger'}`}
                                    style={{ width: `${Math.min(attendPct, 100)}%` }}
                                  />
                                </div>
                                <span className="ss-attend-pct">{attendPct.toFixed(0)}%</span>
                              </div>
                            ) : (
                              <span className="ss-metric-value">—</span>
                            )}
                          </div>
                        </div>

                        {/* Expandable Detail Panel */}
                        {isOpen && (
                          <div className="ss-detail-panel">
                            {/* Score Breakdown */}
                            {(midterms.length > 0 || finals.length > 0) ? (
                              <div className="ss-scores-grid">
                                {/* Midterm Scores */}
                                {midterms.length > 0 && (
                                  <div className="ss-term-scores">
                                    <h4>Midterm Scores</h4>
                                    <div className="ss-score-items">
                                      {midterms.map(c => {
                                        const pct = componentPercent(c);
                                        const cleanName = c.component_name.replace(/\[(Midterm|Final)\]\s*/i, '').trim();
                                        return (
                                          <div key={c.id} className="ss-score-row">
                                            <div className="ss-score-name">
                                              <span className={`ss-cat-dot cat-${c.category}`} />
                                              <span className="ss-cat-label">{categoryLabels[c.category] || c.category}</span>
                                              <span className="ss-comp-name">{cleanName}</span>
                                            </div>
                                            <div className="ss-score-val">
                                              <strong>{c.score ?? '—'}</strong>
                                              <span>/ {c.max_score}</span>
                                              {pct != null && <span className="ss-pct-badge">{pct}%</span>}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                {/* Final Scores */}
                                {finals.length > 0 && (
                                  <div className="ss-term-scores">
                                    <h4>Final Scores</h4>
                                    <div className="ss-score-items">
                                      {finals.map(c => {
                                        const pct = componentPercent(c);
                                        const cleanName = c.component_name.replace(/\[(Midterm|Final)\]\s*/i, '').trim();
                                        return (
                                          <div key={c.id} className="ss-score-row">
                                            <div className="ss-score-name">
                                              <span className={`ss-cat-dot cat-${c.category}`} />
                                              <span className="ss-cat-label">{categoryLabels[c.category] || c.category}</span>
                                              <span className="ss-comp-name">{cleanName}</span>
                                            </div>
                                            <div className="ss-score-val">
                                              <strong>{c.score ?? '—'}</strong>
                                              <span>/ {c.max_score}</span>
                                              {pct != null && <span className="ss-pct-badge">{pct}%</span>}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="ss-empty-scores">No scores encoded yet</div>
                            )}

                            {/* Attendance Detail */}
                            {subject.attendance?.length > 0 && (
                              <div className="ss-attend-detail">
                                <h4>Attendance Log</h4>
                                <div className="ss-attend-dots">
                                  {subject.attendance.map(row => (
                                    <div
                                      key={row.id}
                                      className={`ss-attend-dot ${row.status === 'present' ? 'present' : 'absent'}`}
                                      title={`${formatDate(row.attendance_date)} — ${row.status === 'present' ? 'Present' : 'Absent'}`}
                                    >
                                      {row.status === 'present'
                                        ? <CheckCircle2 size={14} />
                                        : <XCircle size={14} />}
                                      <span>{formatDate(row.attendance_date)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Summary Footer */}
                            {canViewFinal && (
                              <div className="ss-detail-footer">
                                <div className="ss-footer-item">
                                  <span>Weighted Score</span>
                                  <strong>{formatPercent(subject.weighted_score)}</strong>
                                </div>
                                <div className="ss-footer-item">
                                  <span>Final Grade</span>
                                  <strong className={gradeColor(subject.final_grade)}>
                                    {formatGrade(subject.final_grade)}
                                  </strong>
                                </div>
                                <div className="ss-footer-item">
                                  <span>Remarks</span>
                                  <strong>{subject.remarks || '—'}</strong>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
