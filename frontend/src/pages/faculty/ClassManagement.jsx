import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Plus, X } from 'lucide-react';
import './ClassManagement.css';

const dayOptions = [
  { key: 'Mon', label: 'Mon', full: 'Monday' },
  { key: 'Tue', label: 'Tue', full: 'Tuesday' },
  { key: 'Wed', label: 'Wed', full: 'Wednesday' },
  { key: 'Thu', label: 'Thu', full: 'Thursday' },
  { key: 'Fri', label: 'Fri', full: 'Friday' },
  { key: 'Sat', label: 'Sat', full: 'Saturday', weekend: true },
  { key: 'Sun', label: 'Sun', full: 'Sunday', weekend: true },
];

function formatScheduleTime(value) {
  if (!value) return '';
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function buildScheduleText(selectedDays, startTime, endTime) {
  const dayText = dayOptions
    .filter(day => selectedDays.includes(day.key))
    .map(day => day.label)
    .join(' ');
  const timeText = startTime && endTime
    ? `${formatScheduleTime(startTime)}-${formatScheduleTime(endTime)}`
    : '';
  return [dayText, timeText].filter(Boolean).join(' ');
}

export default function ClassManagement() {
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ subject_id: '', section: '', academic_year: '2025-2026', semester: '1st', schedule: '', room: '' });
  const [selectedDays, setSelectedDays] = useState([]);
  const [scheduleTime, setScheduleTime] = useState({ start: '', end: '' });
  const [settings, setSettings] = useState({});
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  const fetch = () => { api.get('/classes').then(r => setClasses(r.data.data || [])); };
  
  useEffect(() => { 
    fetch(); 
    api.get('/subjects?context=class_create&status=approved').then(r => setSubjects(r.data.data || [])); 
    api.get('/settings').then(r => {
      const data = r.data.data || [];
      const map = {};
      data.forEach(s => map[s.setting_key] = s.setting_value);
      setSettings(map);
      setForm(prev => ({
        ...prev,
        academic_year: map.active_academic_year || prev.academic_year,
        semester: map.active_semester || prev.semester
      }));
    }).catch(() => {});
  }, []);

  const openModal = () => {
    setForm({
      subject_id: '',
      section: '',
      academic_year: settings.active_academic_year || '2025-2026',
      semester: settings.active_semester || '1st',
      schedule: '',
      room: ''
    });
    setSelectedDays([]);
    setScheduleTime({ start: '', end: '' });
    setShowModal(true);
  };

  const generateAcademicYears = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
      years.push(`${i}-${i + 1}`);
    }
    if (settings.active_academic_year && !years.includes(settings.active_academic_year)) {
      years.push(settings.active_academic_year);
      years.sort();
    }
    return years.reverse();
  };

  const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const handleCreate = async (e) => {
    e.preventDefault();
    const schedule = buildScheduleText(selectedDays, scheduleTime.start, scheduleTime.end);
    const hasPartialSchedule = selectedDays.length > 0 || scheduleTime.start || scheduleTime.end;

    if (hasPartialSchedule && (!selectedDays.length || !scheduleTime.start || !scheduleTime.end)) {
      showToast('Select class day(s), start time, and end time to complete the schedule.', 'error');
      return;
    }

    if (scheduleTime.start && scheduleTime.end && scheduleTime.start >= scheduleTime.end) {
      showToast('End time must be later than start time.', 'error');
      return;
    }

    try { await api.post('/classes', { ...form, schedule }); showToast('Class created.'); setShowModal(false); fetch(); }
    catch (err) { showToast(err.response?.data?.message || 'Error', 'error'); }
  };

  const toggleDay = (dayKey) => {
    setSelectedDays(prev => (
      prev.includes(dayKey)
        ? prev.filter(item => item !== dayKey)
        : [...prev, dayKey]
    ));
  };

  const clearSchedule = () => {
    setSelectedDays([]);
    setScheduleTime({ start: '', end: '' });
  };

  const statusBadge = { draft: 'badge-warning', faculty_verified: 'badge-info', officially_released: 'badge-success' };

  return (
    <div className="animate-in">
      <div className="page-header flex-between">
        <div><h1>Class Records</h1><p>Create and manage your classes</p></div>
        <button className="btn btn-primary" onClick={openModal}><Plus size={18} />New Class</button>
      </div>

      <div className="table-container">
        <table>
          <thead><tr><th>Subject</th><th>Section</th><th>Schedule</th><th>Semester</th><th>Students</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {classes.map(c => (
              <tr key={c.id}>
                <td><strong>{c.subject_code}</strong> – {c.subject_name}</td>
                <td>{c.section}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{c.schedule || '—'}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{c.semester} {c.academic_year}</td>
                <td>{c.student_count || 0}</td>
                <td><span className={`badge ${statusBadge[c.grade_status]}`}>{c.grade_status?.replace('_', ' ')}</span></td>
                <td><button className="btn btn-secondary btn-sm" onClick={() => navigate(`/faculty/classes/${c.id}`)}>Open</button></td>
              </tr>
            ))}
            {!classes.length && <tr><td colSpan={7} className="empty-state">No classes created yet</td></tr>}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
              <h2>Create Class Record</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="class-record-form">
              <div className="input-group"><label htmlFor="cc-subj">Subject *</label><select id="cc-subj" className="input-field" required value={form.subject_id} onChange={e => setForm({...form, subject_id: e.target.value})}><option value="">Select subject...</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.code} – {s.name}</option>)}</select></div>
              <div className="grid-2">
                <div className="input-group"><label htmlFor="cc-sec">Section *</label><input id="cc-sec" className="input-field" required value={form.section} onChange={e => setForm({...form, section: e.target.value})} placeholder="e.g., CE-3A" /></div>
                <div className="input-group"><label htmlFor="cc-room">Room</label><input id="cc-room" className="input-field" value={form.room} onChange={e => setForm({...form, room: e.target.value})} /></div>
              </div>
              <div className="grid-2">
                <div className="input-group">
                  <label htmlFor="cc-ay">Academic Year *</label>
                  <select id="cc-ay" className="input-field" required value={form.academic_year} onChange={e => setForm({...form, academic_year: e.target.value})}>
                    {generateAcademicYears().map(ay => <option key={ay} value={ay}>{ay}</option>)}
                  </select>
                </div>
                <div className="input-group"><label htmlFor="cc-sem">Semester *</label><select id="cc-sem" className="input-field" value={form.semester} onChange={e => setForm({...form, semester: e.target.value})}><option value="1st">1st</option><option value="2nd">2nd</option><option value="Summer">Summer</option></select></div>
              </div>
              <fieldset className="class-schedule-builder">
                <legend>Schedule</legend>
                <div className="class-day-picker" aria-label="Select class days">
                  {dayOptions.map(day => {
                    const active = selectedDays.includes(day.key);
                    return (
                      <button
                        key={day.key}
                        type="button"
                        className={`class-day-chip ${active ? 'is-selected' : ''} ${day.weekend ? 'is-weekend' : ''}`}
                        onClick={() => toggleDay(day.key)}
                        aria-pressed={active}
                      >
                        <span>{day.label}</span>
                        <small>{day.weekend ? 'Weekend' : day.full}</small>
                      </button>
                    );
                  })}
                </div>

                <div className="grid-2">
                  <div className="input-group">
                    <label htmlFor="cc-start-time">Start Time</label>
                    <input
                      id="cc-start-time"
                      className="input-field"
                      type="time"
                      value={scheduleTime.start}
                      onChange={e => setScheduleTime(prev => ({ ...prev, start: e.target.value }))}
                    />
                  </div>
                  <div className="input-group">
                    <label htmlFor="cc-end-time">End Time</label>
                    <input
                      id="cc-end-time"
                      className="input-field"
                      type="time"
                      value={scheduleTime.end}
                      onChange={e => setScheduleTime(prev => ({ ...prev, end: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="class-schedule-preview">
                  <div>
                    <span>Schedule preview</span>
                    <strong>{buildScheduleText(selectedDays, scheduleTime.start, scheduleTime.end) || 'No schedule selected'}</strong>
                  </div>
                  {(selectedDays.length > 0 || scheduleTime.start || scheduleTime.end) && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={clearSchedule}>Clear</button>
                  )}
                </div>
              </fieldset>
              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>Create Class</button>
            </form>
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
