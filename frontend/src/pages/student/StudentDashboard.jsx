import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { GraduationCap, BookOpen, Award, TrendingUp, Bell } from 'lucide-react';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [grades, setGrades] = useState([]);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    api.get('/grades/student').then(r => setGrades(r.data.data || []));
    api.get('/notifications?limit=5').then(r => setNotifications(r.data.data || []));
  }, []);

  const released = grades.filter(g => g.grade_status === 'officially_released' && g.final_grade);
  const gwa = released.length ? (released.reduce((s,g) => s + parseFloat(g.final_grade||0) * parseFloat(g.units||3), 0) / released.reduce((s,g) => s + parseFloat(g.units||3), 0)).toFixed(2) : '—';
  const passed = released.filter(g => g.remarks === 'Passed').length;
  const failed = released.filter(g => g.remarks === 'Failed').length;

  const statusColors = { officially_released:'var(--success)', faculty_verified:'var(--info)', draft:'var(--warning)' };

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>Welcome, {user?.first_name}!</h1>
        <p>{user?.program || 'Student'} — {user?.student_id || ''}</p>
      </div>

      <div className="grid-4" style={{ marginBottom:'2rem' }}>
        {[
          { label:'Enrolled Subjects', value:grades.length, icon:<BookOpen size={22}/>, color:'var(--accent)' },
          { label:'GWA', value:gwa, icon:<Award size={22}/>, color:'var(--success)' },
          { label:'Passed', value:passed, icon:<TrendingUp size={22}/>, color:'var(--success)' },
          { label:'Failed', value:failed, icon:<GraduationCap size={22}/>, color:failed>0?'var(--danger)':'var(--text-muted)' },
        ].map((c,i)=>(
          <div key={i} className="stat-card">
            <div className="flex-between">
              <div><div className="stat-value" style={{ color:c.color }}>{c.value}</div><div className="stat-label">{c.label}</div></div>
              <div style={{ color:c.color,opacity:0.5 }}>{c.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card" style={{ gridColumn: notifications.length ? 'auto' : '1/-1' }}>
          <h3 style={{ marginBottom:'1rem' }}>My Grades</h3>
          <div className="table-container">
            <table>
              <thead><tr><th>Subject</th><th>Section</th><th>Semester</th><th>Grade</th><th>Remarks</th><th>Status</th></tr></thead>
              <tbody>
                {grades.map((g,i)=>(
                  <tr key={i}>
                    <td><strong>{g.subject_code}</strong> – {g.subject_name}</td>
                    <td>{g.section}</td>
                    <td style={{ color:'var(--text-secondary)',fontSize:'0.8125rem' }}>{g.semester} {g.academic_year}</td>
                    <td style={{ fontWeight:700, color: g.final_grade && g.final_grade<=3 ? 'var(--success)' : g.final_grade>3 ? 'var(--danger)' : 'var(--text-muted)' }}>{g.final_grade ?? '—'}</td>
                    <td><span className={`badge ${g.remarks==='Passed'?'badge-success':g.remarks==='Failed'?'badge-danger':'badge-warning'}`}>{g.remarks||'Pending'}</span></td>
                    <td style={{ color:statusColors[g.grade_status],fontSize:'0.8125rem',fontWeight:500 }}>{g.grade_status==='officially_released'?'Released':g.grade_status==='faculty_verified'?'Verified':'Pending'}</td>
                  </tr>
                ))}
                {!grades.length && <tr><td colSpan={6} className="empty-state">No grades available yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {notifications.length > 0 && (
          <div className="card">
            <h3 style={{ marginBottom:'1rem',display:'flex',alignItems:'center',gap:'0.5rem' }}><Bell size={18}/>Notifications</h3>
            <div style={{ display:'flex',flexDirection:'column',gap:'0.5rem' }}>
              {notifications.map(n => (
                <div key={n.id} style={{ padding:'0.75rem',background:n.is_read?'transparent':'var(--accent-muted)',borderRadius:'var(--radius-sm)',borderLeft:`3px solid ${n.is_read?'var(--border)':'var(--accent)'}` }}>
                  <div style={{ fontWeight:500,fontSize:'0.875rem' }}>{n.title}</div>
                  <div style={{ fontSize:'0.8125rem',color:'var(--text-secondary)' }}>{n.message}</div>
                  <div style={{ fontSize:'0.75rem',color:'var(--text-muted)',marginTop:'0.25rem' }}>{new Date(n.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
