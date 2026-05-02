import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock,
  Send,
  TrendingDown,
  UserX,
  Users,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart as PerformanceLineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import './FacultyDashboard.css';

const LOW_SCORE_LINE = 75;
const ABSENCE_TRIGGER = 3;
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const JS_DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DAY_MATCHERS = [
  { key: 'Mon', pattern: /\b(mon|monday)\b/i },
  { key: 'Tue', pattern: /\b(tue|tues|tuesday)\b/i },
  { key: 'Wed', pattern: /\b(wed|wednesday)\b/i },
  { key: 'Thu', pattern: /\b(thu|thurs|thursday)\b/i },
  { key: 'Fri', pattern: /\b(fri|friday)\b/i },
  { key: 'Sat', pattern: /\b(sat|saturday)\b/i },
  { key: 'Sun', pattern: /\b(sun|sunday)\b/i },
];

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, numberValue(value)));
}

function formatPercent(value, digits = 0) {
  const parsed = numberValue(value);
  return `${parsed.toFixed(digits).replace(/\.0+$/, '')}%`;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthDay(date) {
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function normalizeClass(record) {
  return {
    ...record,
    id: record.id,
    subject_code: record.subject_code || record.code || 'CLASS',
    subject_name: record.subject_name || record.name || 'Untitled subject',
    section: record.section || '-',
    schedule: record.schedule || '',
    room: record.room || 'TBA',
    grade_status: record.grade_status || 'draft',
    student_count: numberValue(record.student_count),
    max_students: numberValue(record.max_students, 50),
    average_score: optionalNumber(record.average_score),
    low_count: numberValue(record.low_count),
    absence_alert_count: numberValue(record.absence_alert_count),
  };
}

function buildFallbackDashboard(classRecords, user) {
  const classes = classRecords.map(normalizeClass);
  const totalStudents = classes.reduce((sum, item) => sum + item.student_count, 0);
  const totalCapacity = classes.reduce((sum, item) => sum + item.max_students, 0) || classes.length * 50 || 1;
  const draftRecords = classes.filter(item => item.grade_status === 'draft').length;
  const releasedRecords = classes.filter(item => item.grade_status === 'officially_released').length;
  const verifiedRecords = classes.filter(item => item.grade_status === 'faculty_verified').length;

  return {
    profile: user || {},
    classes,
    summary: {
      total_classes: classes.length,
      total_students: totalStudents,
      draft_records: draftRecords,
      released_records: releasedRecords,
      verified_records: verifiedRecords,
      low_performance_students: 0,
      midterm_below_target: 0,
      final_below_target: 0,
      subject_below_target: 0,
      absence_alerts: 0,
      capacity_percent: totalCapacity ? (totalStudents / totalCapacity) * 100 : 0,
      average_score: 0,
      low_score_line: LOW_SCORE_LINE,
      absence_trigger: ABSENCE_TRIGGER,
    },
    performance_curve: classes.map(item => ({
      class_id: item.id,
      subject_code: item.subject_code,
      average_score: item.average_score ?? 0,
    })),
    student_phases: { on_track: totalStudents, low: 0, absence: 0 },
    subject_risks: classes.map(item => ({
      ...item,
      risk_count: item.low_count + item.absence_alert_count,
    })),
    low_performance_watchlist: [],
    absence_watchlist: [],
  };
}

function normalizeDashboard(data, user) {
  if (!data || typeof data !== 'object') return buildFallbackDashboard([], user);

  const classes = Array.isArray(data.classes) ? data.classes.map(normalizeClass) : [];
  const fallback = buildFallbackDashboard(classes, user);
  const summary = data.summary || {};

  return {
    profile: data.profile || user || {},
    classes,
    summary: {
      ...fallback.summary,
      ...summary,
      total_classes: numberValue(summary.total_classes, fallback.summary.total_classes),
      total_students: numberValue(summary.total_students, fallback.summary.total_students),
      draft_records: numberValue(summary.draft_records, fallback.summary.draft_records),
      released_records: numberValue(summary.released_records, fallback.summary.released_records),
      verified_records: numberValue(summary.verified_records, fallback.summary.verified_records),
      low_performance_students: numberValue(summary.low_performance_students),
      midterm_below_target: numberValue(summary.midterm_below_target),
      final_below_target: numberValue(summary.final_below_target),
      subject_below_target: numberValue(summary.subject_below_target),
      absence_alerts: numberValue(summary.absence_alerts),
      capacity_percent: numberValue(summary.capacity_percent, fallback.summary.capacity_percent),
      average_score: numberValue(summary.average_score, fallback.summary.average_score),
      low_score_line: numberValue(summary.low_score_line, LOW_SCORE_LINE),
      absence_trigger: numberValue(summary.absence_trigger, ABSENCE_TRIGGER),
    },
    performance_curve: Array.isArray(data.performance_curve) && data.performance_curve.length
      ? data.performance_curve.map(item => ({
          class_id: item.class_id,
          subject_code: item.subject_code || 'CLASS',
          average_score: numberValue(item.average_score),
        }))
      : fallback.performance_curve,
    student_phases: {
      on_track: numberValue(data.student_phases?.on_track, fallback.student_phases.on_track),
      low: numberValue(data.student_phases?.low, fallback.student_phases.low),
      absence: numberValue(data.student_phases?.absence, fallback.student_phases.absence),
    },
    subject_risks: Array.isArray(data.subject_risks) && data.subject_risks.length
      ? data.subject_risks.map(item => ({
          ...normalizeClass(item),
          risk_count: numberValue(item.risk_count, numberValue(item.low_count) + numberValue(item.absence_alert_count)),
      }))
      : fallback.subject_risks,
    low_performance_watchlist: Array.isArray(data.low_performance_watchlist) ? data.low_performance_watchlist : [],
    absence_watchlist: Array.isArray(data.absence_watchlist) ? data.absence_watchlist : [],
  };
}

function addDay(days, key) {
  if (!days.includes(key)) days.push(key);
}

function parseSchedule(schedule) {
  const value = String(schedule || '');
  const days = [];

  if (/\bMWF\b/i.test(value)) {
    addDay(days, 'Mon');
    addDay(days, 'Wed');
    addDay(days, 'Fri');
  }
  if (/\bTTh\b/i.test(value)) {
    addDay(days, 'Tue');
    addDay(days, 'Thu');
  }
  if (/\bMW\b/i.test(value)) {
    addDay(days, 'Mon');
    addDay(days, 'Wed');
  }

  DAY_MATCHERS.forEach(day => {
    if (day.pattern.test(value)) addDay(days, day.key);
  });

  const orderedDays = WEEK_DAYS.filter(day => days.includes(day));
  const timeMatch = value.match(/(\d{1,2}:?\d{0,2}\s*(?:AM|PM)?\s*[-–]\s*\d{1,2}:?\d{0,2}\s*(?:AM|PM)?)/i);
  const timeText = timeMatch ? timeMatch[1].replace(/\s*[-–]\s*/, ' - ').replace(/\s+/g, ' ').trim() : '';

  return { days: orderedDays, timeText };
}

function buildWeekDates(today) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return {
      date,
      key: toDateKey(date),
      day: JS_DAY_KEYS[date.getDay()],
      dayLabel: JS_DAY_KEYS[date.getDay()].toUpperCase(),
      dayNumber: String(date.getDate()).padStart(2, '0'),
    };
  });
}

function buildWeeklyLoad(classes) {
  return WEEK_DAYS.map(day => ({
    day,
    classes: classes
      .map(item => ({ ...item, parsedSchedule: parseSchedule(item.schedule) }))
      .filter(item => item.parsedSchedule.days.includes(day)),
  }));
}

function buildUpcomingClasses(classes, today) {
  const dates = buildWeekDates(today);
  const upcoming = [];

  dates.forEach(dateItem => {
    classes.forEach(item => {
      const parsedSchedule = parseSchedule(item.schedule);
      if (parsedSchedule.days.includes(dateItem.day)) {
        upcoming.push({
          ...item,
          parsedSchedule,
          date_key: dateItem.key,
          day_number: dateItem.dayNumber,
          day_label: dateItem.dayLabel,
        });
      }
    });
  });

  if (!upcoming.length) {
    return classes.slice(0, 3).map(item => ({
      ...item,
      parsedSchedule: parseSchedule(item.schedule),
      date_key: '',
      day_number: '--',
      day_label: 'TBA',
    }));
  }

  return upcoming.slice(0, 6);
}

function formatClassMeta(item) {
  return [item.subject_code, item.section, item.room].filter(Boolean).join(' - ');
}

function formatScore(value) {
  if (value === null || value === undefined || value === '') return 'Pending';
  return formatPercent(value, 1);
}

function performanceStatusLabel(status) {
  if (status === 'subject_below_target') return 'Subject below target';
  if (status === 'final_below_target') return 'Final below target';
  if (status === 'midterm_below_target') return 'Midterm below target';
  return 'Below target';
}

function performanceReasonText(reason) {
  if (!reason) return '';
  const label = reason.label || performanceStatusLabel(`${reason.type}_below_target`);
  const score = reason.score === null || reason.score === undefined ? '' : ` ${formatPercent(reason.score, 1)}`;
  return `${label}${score}`;
}

function pendingTermText(item) {
  if (!item?.has_final_scores) return 'Final pending';
  if (!item?.has_midterm_scores) return 'Midterm pending';
  if (!item?.subject_score && item?.subject_score !== 0) return 'Subject pending';
  return '';
}

function FacultyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="faculty-chart-tooltip">
      <strong>{label}</strong>
      <span>{formatPercent(payload[0].value, 1)} average</span>
    </div>
  );
}

export default function FacultyDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [toast, setToast] = useState(null);
  const [warningSending, setWarningSending] = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setNotice('');

      try {
        const response = await api.get('/faculty/dashboard');
        if (!cancelled) setDashboard(normalizeDashboard(response.data.data, user));
      } catch (dashboardError) {
        try {
          const fallback = await api.get('/classes');
          if (!cancelled) {
            setDashboard(buildFallbackDashboard(fallback.data.data || [], user));
            setNotice(dashboardError.userMessage || 'Live faculty analytics are unavailable. Showing class records only.');
          }
        } catch (classError) {
          if (!cancelled) {
            setDashboard(buildFallbackDashboard([], user));
            setNotice(classError.userMessage || 'Unable to load the faculty dashboard.');
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();
    const intervalId = window.setInterval(loadDashboard, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [user]);

  const weekDates = useMemo(() => buildWeekDates(today), [today]);
  const classes = dashboard?.classes || [];
  const summary = dashboard?.summary || buildFallbackDashboard([], user).summary;
  const phases = dashboard?.student_phases || { on_track: 0, low: 0, absence: 0 };
  const phaseTotal = Math.max(1, phases.on_track + phases.low + phases.absence);
  const upcomingClasses = useMemo(() => buildUpcomingClasses(classes, today), [classes, today]);
  const weeklyLoad = useMemo(() => buildWeeklyLoad(classes), [classes]);
  const riskSubjects = (dashboard?.subject_risks || [])
    .slice()
    .sort((a, b) => numberValue(b.risk_count) - numberValue(a.risk_count))
    .slice(0, 4);
  const lowPerformanceWatchlist = (dashboard?.low_performance_watchlist || []).slice(0, 6);
  const watchlist = (dashboard?.absence_watchlist || []).slice(0, 4);
  const chartData = (dashboard?.performance_curve || []).length
    ? dashboard.performance_curve
    : classes.map(item => ({
        class_id: item.id,
        subject_code: item.subject_code,
        average_score: item.average_score ?? 0,
      }));

  const kpis = [
    {
      label: 'Classes',
      value: summary.total_classes,
      detail: `${summary.draft_records} draft records`,
      icon: BookOpen,
      tone: 'amber',
      progress: summary.total_classes ? (summary.draft_records / summary.total_classes) * 100 : 0,
    },
    {
      label: 'Students',
      value: summary.total_students,
      detail: `${formatPercent(summary.capacity_percent)} capacity`,
      icon: Users,
      tone: 'blue',
      progress: summary.capacity_percent,
    },
    {
      label: 'Low Performance',
      value: summary.low_performance_students,
      detail: `${summary.subject_below_target} subject / ${summary.final_below_target} final / ${summary.midterm_below_target} midterm`,
      icon: TrendingDown,
      tone: 'warning',
      progress: summary.low_score_line,
    },
    {
      label: 'Absence Alerts',
      value: summary.absence_alerts,
      detail: `${summary.absence_trigger} consecutive trigger`,
      icon: UserX,
      tone: 'danger',
      progress: summary.absence_alerts ? 50 : 0,
    },
  ];

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => setToast(null), 3200);
  };

  const handleSendWarning = async (item) => {
    if (!item.enrollment_id) return;

    setWarningSending(item.enrollment_id);
    try {
      await api.post('/faculty/absence-warning', {
        enrollment_id: item.enrollment_id,
        dates: item.dates || item.absence_dates || [],
      });
      showToast('Absence warning sent.');
    } catch (error) {
      showToast(error.response?.data?.message || error.userMessage || 'Unable to send warning.', 'error');
    } finally {
      setWarningSending(null);
    }
  };

  return (
    <div className="faculty-operations-page animate-in" aria-live="polite">
      <div className="faculty-ops-shell">
        <div className="faculty-main-column">
          <section className="faculty-hero-row">
            <div className="faculty-title-block">
              <span><Activity size={13} /> Faculty operations</span>
              <h1>{getGreeting()}, {dashboard?.profile?.first_name || user?.first_name || 'Faculty'}</h1>
              <p>Class calendar, grades, and attendance risk are synced from live records</p>
            </div>

            <div className="faculty-hero-actions">
              <div className="faculty-today">
                <span>Today</span>
                <strong>{monthDay(today)}</strong>
              </div>
              <button type="button" className="faculty-primary-action" onClick={() => navigate('/faculty/classes')}>
                Manage Classes
                <ArrowRight size={16} />
              </button>
            </div>
          </section>

          {notice && <div className="faculty-notice"><AlertTriangle size={15} />{notice}</div>}

          <section className="faculty-kpi-grid" aria-label="Faculty dashboard metrics">
            {kpis.map(item => {
              const Icon = item.icon;
              return (
                <article key={item.label} className={`faculty-kpi-card tone-${item.tone}`}>
                  <div className="faculty-kpi-head">
                    <span>{item.label}</span>
                    <Icon size={17} />
                  </div>
                  <strong>{item.value}</strong>
                  <p>{item.detail}</p>
                  <div className="faculty-meter" aria-hidden="true">
                    <span style={{ width: `${clampPercent(item.progress)}%` }} />
                  </div>
                </article>
              );
            })}
          </section>

          <section className="faculty-analytics-grid">
            <article className="faculty-panel faculty-chart-panel">
              <div className="faculty-panel-head">
                <div>
                  <span><BarChart3 size={13} /> Academic signal</span>
                  <h2>Class performance curve</h2>
                </div>
                <strong>{formatPercent(summary.average_score, 1)} average</strong>
              </div>

              <div className="faculty-chart-frame">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PerformanceLineChart data={chartData} margin={{ top: 8, right: 8, left: -22, bottom: 2 }}>
                      <CartesianGrid stroke="var(--faculty-chart-grid)" strokeDasharray="3 9" vertical={false} />
                      <XAxis
                        dataKey="subject_code"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--faculty-muted)', fontSize: 10 }}
                        interval={0}
                      />
                      <YAxis
                        domain={[0, 100]}
                        ticks={[0, 25, 50, 75, 100]}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--faculty-muted)', fontSize: 10 }}
                      />
                      <Tooltip content={<FacultyTooltip />} cursor={{ stroke: 'var(--faculty-chart-cursor)' }} />
                      <ReferenceLine y={summary.low_score_line} stroke="var(--faculty-chart-reference)" strokeDasharray="4 6" />
                      <Line
                        type="monotone"
                        dataKey="average_score"
                        stroke="var(--faculty-accent)"
                        strokeWidth={3}
                        dot={{ r: 3, fill: 'var(--faculty-accent)', strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: 'var(--faculty-accent)' }}
                      />
                    </PerformanceLineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="faculty-empty-compact">No class averages yet.</div>
                )}
              </div>
            </article>

            <article className="faculty-panel faculty-phase-panel">
              <div className="faculty-phase-count">
                <span>Student phases</span>
                <strong>{phases.on_track + phases.low + phases.absence}</strong>
              </div>
              <div className="faculty-phase-bar" aria-hidden="true">
                <span className="phase-on" style={{ width: `${(phases.on_track / phaseTotal) * 100}%` }} />
                <span className="phase-low" style={{ width: `${(phases.low / phaseTotal) * 100}%` }} />
                <span className="phase-absence" style={{ width: `${(phases.absence / phaseTotal) * 100}%` }} />
              </div>
              <div className="faculty-phase-legend">
                <span><i className="phase-on" /> On track: {phases.on_track}</span>
                <span><i className="phase-low" /> Low: {phases.low}</span>
                <span><i className="phase-absence" /> Absence: {phases.absence}</span>
              </div>
            </article>
          </section>

          <section className="faculty-panel faculty-week-panel">
            <div className="faculty-panel-head">
              <div>
                <span><CalendarDays size={13} /> Class calendar</span>
                <h2>Weekly teaching load</h2>
              </div>
              <strong>{classes.length} active class(es)</strong>
            </div>

            <div className="faculty-week-grid">
              {weeklyLoad.map(day => (
                <article key={day.day} className={`faculty-day-card ${day.classes.length ? 'has-class' : ''}`}>
                  <strong>{day.day}</strong>
                  <div>
                    {day.classes.length ? day.classes.slice(0, 2).map(item => (
                      <button type="button" key={`${day.day}-${item.id}`} onClick={() => navigate(`/faculty/classes/${item.id}`)}>
                        <span>{item.parsedSchedule.timeText || 'Time TBA'}</span>
                        <b>{item.subject_code}</b>
                      </button>
                    )) : <span className="faculty-day-empty">No load</span>}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="faculty-panel faculty-low-panel">
            <div className="faculty-panel-head">
              <div>
                <span><TrendingDown size={13} /> Students below target</span>
                <h2>Low performance</h2>
              </div>
              <strong>{summary.subject_below_target} subject / {summary.final_below_target} final / {summary.midterm_below_target} midterm</strong>
            </div>

            {lowPerformanceWatchlist.length ? (
              <div className="faculty-low-list">
                {lowPerformanceWatchlist.map(item => (
                  <button 
                    type="button" 
                    key={`${item.enrollment_id}-${item.class_id}`} 
                    className={`faculty-low-row status-${item.performance_status}`}
                    onClick={() => navigate(`/faculty/classes/${item.class_id}`)}
                  >
                    <div className="faculty-low-info">
                      <strong>{item.full_name || 'Student'}</strong>
                      <span>{formatClassMeta(item)}</span>
                      <div className="faculty-low-reasons">
                        {(item.reasons || []).slice(0, 3).map(reason => (
                          <em key={`${reason.type}-${reason.score}`}>{performanceReasonText(reason)}</em>
                        ))}
                        {pendingTermText(item) && <em className="is-pending">{pendingTermText(item)}</em>}
                      </div>
                    </div>

                    <div className="faculty-low-metrics" aria-label="Term performance scores">
                      <div><small>MID</small><b>{formatScore(item.midterm_score)}</b></div>
                      <div><small>FIN</small><b>{formatScore(item.final_score)}</b></div>
                      <div><small>SUB</small><b>{item.has_midterm_scores && item.has_final_scores ? formatScore(item.subject_score) : '-'}</b></div>
                    </div>

                    <div className="faculty-low-action">
                      <span className="faculty-low-badge">{performanceStatusLabel(item.performance_status)}</span>
                      <ChevronRight size={16} />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="faculty-empty-compact">No students are below the current performance target.</div>
            )}
          </section>

          <section className="faculty-record-strip">
            {classes.slice(0, 4).map(item => (
              <button type="button" key={item.id} className="faculty-record-chip" onClick={() => navigate(`/faculty/classes/${item.id}`)}>
                <span>{item.subject_code}</span>
                <strong>{item.subject_name}</strong>
                <small>{item.section} - {item.student_count} student(s)</small>
              </button>
            ))}
          </section>
        </div>

        <aside className="faculty-side-column">
          <section className="faculty-panel faculty-schedule-panel">
            <div className="faculty-panel-head">
              <div>
                <span><Clock size={13} /> Upcoming classes</span>
                <h2>Schedule rail</h2>
              </div>
              <button type="button" onClick={() => navigate('/faculty/classes')}>
                Open
                <ChevronRight size={13} />
              </button>
            </div>

            <div className="faculty-date-strip">
              {weekDates.map((item, index) => (
                <span key={item.key} className={index === 0 ? 'is-today' : ''}>
                  <strong>{item.dayNumber}</strong>
                  <small>{item.dayLabel}</small>
                </span>
              ))}
            </div>

            <div className="faculty-upcoming-list">
              {upcomingClasses.length ? upcomingClasses.slice(0, 3).map((item, index) => (
                <button type="button" key={`${item.id}-${item.date_key || index}`} onClick={() => navigate(`/faculty/classes/${item.id}`)}>
                  <span>{item.parsedSchedule.timeText || 'Time TBA'}</span>
                  <div>
                    <strong>{item.subject_code}</strong>
                    <small>{item.room ? `${item.section} - ${item.room}` : item.section}</small>
                  </div>
                  <ChevronRight size={15} />
                </button>
              )) : <div className="faculty-empty-compact">No upcoming classes.</div>}
            </div>
          </section>

          <section className="faculty-panel faculty-risk-panel">
            <div className="faculty-panel-head">
              <div>
                <span><BarChart3 size={13} /> Subject risk</span>
                <h2>Handled subjects</h2>
              </div>
              <strong>{formatPercent(summary.low_score_line)} line</strong>
            </div>

            <div className="faculty-risk-list">
              {riskSubjects.length ? riskSubjects.map(item => (
                <button type="button" key={item.id} onClick={() => navigate(`/faculty/classes/${item.id}`)}>
                  <div>
                    <strong>{item.subject_code}</strong>
                    <span>{item.subject_name}</span>
                  </div>
                  <div className="faculty-risk-tags">
                    <span>{item.subject_below_count || 0} subject</span>
                    <span>{item.final_below_count || 0} final</span>
                    <span>{item.midterm_below_count || 0} midterm</span>
                    <span>{item.absence_alert_count} absence</span>
                    <span>{formatPercent(item.average_score ?? 0, 1)} avg</span>
                  </div>
                </button>
              )) : <div className="faculty-empty-compact">No subject risk yet.</div>}
            </div>
          </section>

          <section className="faculty-panel faculty-absence-panel">
            <div className="faculty-panel-head">
              <div>
                <span><AlertTriangle size={13} /> Absence warnings</span>
                <h2>{summary.absence_trigger}-day watchlist</h2>
              </div>
              <strong>{summary.absence_trigger} trigger</strong>
            </div>

            <div className="faculty-watch-list">
              {watchlist.length ? watchlist.map(item => {
                const dates = item.dates || item.absence_dates || [];
                const studentName = item.full_name || [item.first_name, item.last_name].filter(Boolean).join(' ');
                return (
                  <article key={item.enrollment_id || `${item.student_id}-${item.class_id}`}>
                    <div className="faculty-watch-head">
                      <div>
                        <strong>{studentName || 'Student'}</strong>
                        <span>{formatClassMeta(item)} - {item.consecutive_absences || summary.absence_trigger} consecutive absences</span>
                      </div>
                      <UserX size={18} />
                    </div>
                    <div className="faculty-watch-dates">
                      {dates.slice(-4).map(date => <span key={date}>{date}</span>)}
                    </div>
                    <button
                      type="button"
                      className="faculty-warning-button"
                      onClick={() => handleSendWarning(item)}
                      disabled={warningSending === item.enrollment_id}
                    >
                      <Send size={14} />
                      {warningSending === item.enrollment_id ? 'Sending...' : 'Send warning'}
                    </button>
                  </article>
                );
              }) : <div className="faculty-empty-compact">No absence warnings.</div>}
            </div>
          </section>
        </aside>
      </div>

      {loading && <div className="faculty-loading">Refreshing dashboard...</div>}
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
