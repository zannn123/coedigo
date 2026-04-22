import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { ArrowLeft, UserPlus, Calculator, CheckCircle, Send, X, Plus, Trash2, CalendarDays, ClipboardCheck } from 'lucide-react';

export default function GradeBook() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [classData, setClassData] = useState(null);
  const [grades, setGrades] = useState([]);
  const [availableStudents, setAvailableStudents] = useState([]);
  const [showEnroll, setShowEnroll] = useState(false);
  const [showEncode, setShowEncode] = useState(null);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [components, setComponents] = useState([]);
  const [deletedComponentIds, setDeletedComponentIds] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [deletedAttendanceIds, setDeletedAttendanceIds] = useState([]);
  const [searchStudent, setSearchStudent] = useState('');
  const [toast, setToast] = useState(null);

  const fetchData = () => {
    api.get(`/classes/${classId}`).then(r => setClassData(r.data.data));
    api.get(`/grades/class/${classId}`).then(r => setGrades(r.data.data || []));
  };
  useEffect(() => { fetchData(); }, [classId]);

  const showToast = (m, t='success') => { setToast({msg:m,type:t}); setTimeout(()=>setToast(null),3000); };

  const openEnroll = () => {
    api.get('/users?role=student&limit=100').then(r => {
      const enrolled = new Set(grades.map(g => g.student_id));
      setAvailableStudents((r.data.data||[]).filter(s => !enrolled.has(s.id)));
    });
    setSelectedStudents([]);
    setShowEnroll(true);
  };

  const handleEnroll = async () => {
    if (!selectedStudents.length) return;
    try { await api.post(`/classes/${classId}/enroll`, { student_ids: selectedStudents }); showToast('Students enrolled.'); setShowEnroll(false); fetchData(); }
    catch(e) { showToast(e.response?.data?.message||'Error','error'); }
  };

  const openEncode = (student) => {
    setShowEncode(student);
    setDeletedComponentIds([]);
    setDeletedAttendanceIds([]);
    const editableComponents = (student.components || []).filter(c => c.component_name !== 'Attendance');
    setAttendance((student.attendance || []).map(a => ({ ...a })));
    setComponents(editableComponents.length ? editableComponents.map(c => ({...c})) : [
      { category:'major_exam', component_name:'Midterm Exam', max_score:100, score:'' },
      { category:'major_exam', component_name:'Final Exam', max_score:100, score:'' },
      { category:'quiz', component_name:'Quiz 1', max_score:50, score:'' },
      { category:'quiz', component_name:'Quiz 2', max_score:50, score:'' },
      { category:'project', component_name:'Project 1', max_score:100, score:'' },
    ]);
  };

  const addComponent = (cat) => { setComponents([...components, { category: cat, component_name: '', max_score: 100, score: '' }]); };
  const removeComponent = (i) => {
    const removed = components[i];
    if (removed?.id) setDeletedComponentIds(ids => [...ids, removed.id]);
    setComponents(components.filter((_, idx) => idx !== i));
  };
  const updateComp = (i, field, val) => { const c = [...components]; c[i][field] = val; setComponents(c); };
  const updateAttendance = (i, field, val) => { const rows = [...attendance]; rows[i][field] = val; setAttendance(rows); };
  const addAttendance = () => {
    const today = new Date().toISOString().slice(0, 10);
    setAttendance([...attendance, { attendance_date: today, status: 'present' }]);
  };
  const removeAttendance = (i) => {
    const removed = attendance[i];
    if (removed?.id) setDeletedAttendanceIds(ids => [...ids, removed.id]);
    setAttendance(attendance.filter((_, idx) => idx !== i));
  };

  const handleEncode = async () => {
    try {
      await Promise.all(deletedComponentIds.map(id => api.delete(`/grades/component/${id}`)));
      const validComponents = components.filter(c => c.component_name?.trim());
      if (validComponents.length) {
        await api.post('/grades/encode', {
          enrollment_id: showEncode.enrollment_id,
          components: validComponents.map(c => ({
            ...c,
            component_name: c.component_name.trim(),
            max_score: c.max_score === '' ? 0 : parseFloat(c.max_score),
            score: c.score === '' ? null : parseFloat(c.score)
          }))
        });
      }
      await api.post('/grades/attendance', {
        enrollment_id: showEncode.enrollment_id,
        attendance: attendance
          .filter(a => a.attendance_date)
          .map(a => ({ id: a.id, attendance_date: a.attendance_date, status: a.status || 'absent' })),
        delete_ids: deletedAttendanceIds
      });
      showToast('Scores saved & grade computed.');
      setShowEncode(null); fetchData();
    } catch(e) { showToast(e.response?.data?.message||'Error','error'); }
  };

  const computeAll = async () => {
    try { await api.post(`/grades/compute-class/${classId}`); showToast('All grades computed.'); fetchData(); }
    catch(e) { showToast('Error computing','error'); }
  };

  const updateStatus = async (status) => {
    try { await api.put(`/classes/${classId}/status`, { grade_status: status }); showToast(`Status: ${status.replace('_',' ')}`); fetchData(); }
    catch(e) { showToast(e.response?.data?.message||'Error','error'); }
  };

  const catLabels = { major_exam: 'Major Exams (40%)', quiz: 'Quizzes (30%)', project: 'Projects/Outputs (30%)' };
  const statusBadge = { draft:'badge-warning', faculty_verified:'badge-info', officially_released:'badge-success' };
  const attendanceStats = rows => {
    const total = rows.length;
    const present = rows.filter(r => r.status === 'present').length;
    return { total, present, percentage: total ? Math.round((present / total) * 100) : null };
  };

  if (!classData) return <div className="empty-state">Loading...</div>;

  return (
    <div className="animate-in">
      <div className="page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/faculty/classes')} style={{ marginBottom: '0.75rem' }}><ArrowLeft size={16} /> Back to Classes</button>
        <div className="flex-between">
          <div>
            <h1>{classData.subject_code} – {classData.subject_name}</h1>
            <p>Section {classData.section} | {classData.semester} {classData.academic_year} | {classData.faculty_name}</p>
          </div>
          <span className={`badge ${statusBadge[classData.grade_status]}`} style={{ fontSize:'0.8125rem', padding:'0.375rem 0.875rem' }}>{classData.grade_status?.replace('_',' ')}</span>
        </div>
      </div>

      <div className="flex-gap" style={{ marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={openEnroll}><UserPlus size={16} />Enroll Students</button>
        <button className="btn btn-secondary" onClick={computeAll}><Calculator size={16} />Compute All</button>
        {classData.grade_status === 'draft' && <button className="btn btn-secondary" onClick={() => updateStatus('faculty_verified')}><CheckCircle size={16} />Mark Verified</button>}
        {classData.grade_status === 'faculty_verified' && <button className="btn btn-primary" onClick={() => updateStatus('officially_released')}><Send size={16} />Release Grades</button>}
      </div>

      <div className="table-container">
        <table>
          <thead><tr><th>#</th><th>Student No.</th><th>Name</th><th>Program</th><th>Exams</th><th>Quizzes</th><th>Projects</th><th>Attendance</th><th>Weighted</th><th>Grade</th><th>Remarks</th><th>Action</th></tr></thead>
          <tbody>
            {grades.map((s, i) => (
              <tr key={s.enrollment_id}>
                <td>{i+1}</td>
                <td style={{ color:'var(--text-secondary)' }}>{s.student_number || '—'}</td>
                <td style={{ fontWeight:500 }}>{s.last_name}, {s.first_name}</td>
                <td style={{ color:'var(--text-secondary)' }}>{s.program || '—'}</td>
                <td>{s.grade?.major_exam_avg != null ? parseFloat(s.grade.major_exam_avg).toFixed(1)+'%' : '—'}</td>
                <td>{s.grade?.quiz_avg != null ? parseFloat(s.grade.quiz_avg).toFixed(1)+'%' : '—'}</td>
                <td>{s.grade?.project_avg != null ? parseFloat(s.grade.project_avg).toFixed(1)+'%' : '—'}</td>
                <td>
                  {s.attendance_summary?.total_sessions
                    ? <span style={{ fontWeight:600 }}>{parseFloat(s.attendance_summary.total_points).toFixed(0)}/{s.attendance_summary.possible_points} pts</span>
                    : <span style={{ color:'var(--text-muted)' }}>—</span>}
                </td>
                <td style={{ fontWeight:600 }}>{s.grade?.weighted_score != null ? parseFloat(s.grade.weighted_score).toFixed(1)+'%' : '—'}</td>
                <td style={{ fontWeight:700, color: s.grade?.final_grade <= 3 ? 'var(--success)' : s.grade?.final_grade ? 'var(--danger)' : 'var(--text-muted)' }}>{s.grade?.final_grade ?? '—'}</td>
                <td><span className={`badge ${s.grade?.remarks==='Passed'?'badge-success':s.grade?.remarks==='Failed'?'badge-danger':'badge-warning'}`}>{s.grade?.remarks||'No Grade'}</span></td>
                <td><button className="btn btn-secondary btn-sm" onClick={() => openEncode(s)}><ClipboardCheck size={14}/>Encode</button></td>
              </tr>
            ))}
            {!grades.length && <tr><td colSpan={12} className="empty-state">No students enrolled</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Enroll Modal */}
      {showEnroll && (
        <div className="modal-overlay" onClick={() => setShowEnroll(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth:'600px' }}>
            <div className="flex-between" style={{ marginBottom:'1rem' }}><h2>Enroll Students</h2><button className="btn btn-ghost btn-sm" onClick={() => setShowEnroll(false)}><X size={18}/></button></div>
            <input className="input-field" style={{ width:'100%',marginBottom:'1rem' }} placeholder="Search students..." value={searchStudent} onChange={e => setSearchStudent(e.target.value)} />
            <div style={{ maxHeight:'300px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'0.25rem' }}>
              {availableStudents.filter(s => !searchStudent || `${s.first_name} ${s.last_name} ${s.student_id}`.toLowerCase().includes(searchStudent.toLowerCase())).map(s => (
                <label key={s.id} style={{ display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.5rem 0.75rem',borderRadius:'var(--radius-sm)',cursor:'pointer',background: selectedStudents.includes(s.id)?'var(--accent-muted)':'transparent' }}>
                  <input type="checkbox" checked={selectedStudents.includes(s.id)} onChange={e => setSelectedStudents(e.target.checked ? [...selectedStudents,s.id] : selectedStudents.filter(x=>x!==s.id))} />
                  <span style={{ fontWeight:500 }}>{s.last_name}, {s.first_name}</span>
                  <span style={{ color:'var(--text-muted)',fontSize:'0.8125rem',marginLeft:'auto' }}>{s.student_id||''} {s.program||''}</span>
                </label>
              ))}
            </div>
            <button className="btn btn-primary" style={{ width:'100%',marginTop:'1rem' }} onClick={handleEnroll} disabled={!selectedStudents.length}>Enroll {selectedStudents.length} Student(s)</button>
          </div>
        </div>
      )}

      {/* Encode Modal */}
      {showEncode && (
        <div className="modal-overlay" onClick={() => setShowEncode(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth:'920px' }}>
            <div className="flex-between" style={{ marginBottom:'1rem' }}><h2>Encode: {showEncode.last_name}, {showEncode.first_name}</h2><button className="btn btn-ghost btn-sm" onClick={() => setShowEncode(null)}><X size={18}/></button></div>
            {['major_exam','quiz','project'].map(cat => (
              <div key={cat} style={{ marginBottom:'1.5rem' }}>
                <div className="flex-between" style={{ marginBottom:'0.5rem' }}>
                  <h3 style={{ fontSize:'0.9375rem' }}>{catLabels[cat]}</h3>
                  <button className="btn btn-ghost btn-sm" onClick={() => addComponent(cat)}><Plus size={14}/> Add</button>
                </div>
                {components.filter(c=>c.category===cat).map((comp, ci) => {
                  const idx = components.indexOf(comp);
                  return (
                    <div key={idx} className="flex-gap score-component-row" style={{ marginBottom:'0.5rem' }}>
                      <input className="input-field" style={{ flex:2 }} placeholder="Name" value={comp.component_name} onChange={e => updateComp(idx,'component_name',e.target.value)} />
                      <input type="number" className="input-field" style={{ width:'80px' }} placeholder="Max" value={comp.max_score} onChange={e => updateComp(idx,'max_score',e.target.value)} />
                      <input type="number" className="input-field" style={{ width:'80px' }} placeholder="Score" value={comp.score} onChange={e => updateComp(idx,'score',e.target.value)} />
                      <button className="btn btn-ghost btn-sm" onClick={() => removeComponent(idx)}><Trash2 size={14}/></button>
                    </div>
                  );
                })}
              </div>
            ))}
            <div style={{ marginBottom:'1.5rem' }}>
              <div className="flex-between" style={{ marginBottom:'0.75rem' }}>
                <div>
                  <h3 style={{ fontSize:'0.9375rem', display:'flex', alignItems:'center', gap:'0.5rem' }}><CalendarDays size={16}/>Attendance Dates</h3>
                  <p style={{ color:'var(--text-secondary)', fontSize:'0.8125rem' }}>Present marks count as 1 point each.</p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={addAttendance}><Plus size={14}/> Add Date</button>
              </div>
              {(() => {
                const stats = attendanceStats(attendance);
                return (
                  <div className="metric-strip" style={{ marginBottom:'0.75rem' }}>
                    <div><strong>{stats.present}</strong><span>Present Points</span></div>
                    <div><strong>{stats.total}</strong><span>Class Dates</span></div>
                    <div><strong>{stats.percentage ?? '—'}{stats.percentage != null ? '%' : ''}</strong><span>Attendance Rate</span></div>
                  </div>
                );
              })()}
              <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                {attendance.map((row, idx) => (
                  <div key={row.id || idx} className="attendance-row">
                    <input type="date" className="input-field" value={row.attendance_date || ''} onChange={e => updateAttendance(idx, 'attendance_date', e.target.value)} />
                    <select className="input-field" value={row.status || 'absent'} onChange={e => updateAttendance(idx, 'status', e.target.value)}>
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                    </select>
                    <span className={`badge ${row.status === 'present' ? 'badge-success' : 'badge-danger'}`}>{row.status === 'present' ? '+1 point' : '0 point'}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => removeAttendance(idx)}><Trash2 size={14}/></button>
                  </div>
                ))}
                {!attendance.length && <div className="empty-state" style={{ padding:'1rem' }}>No attendance dates encoded yet</div>}
              </div>
            </div>
            <button className="btn btn-primary" style={{ width:'100%' }} onClick={handleEncode}>Save & Compute Grade</button>
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
