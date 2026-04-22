import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { BookOpen, Award, Bell, ClipboardList, UserCheck } from 'lucide-react';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [grades, setGrades] = useState([]);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    api.get('/grades/student').then(r => setGrades(r.data.data || []));
    api.get('/notifications?limit=5').then(r => setNotifications(r.data.data || []));
  }, []);

  const released = grades.filter(g => g.grade_status === 'officially_released' && g.final_grade);
  const gwa = released.length ? (released.reduce((s,g) => s + parseFloat(g.final_grade||0) * parseFloat(g.units||3), 0) / released.reduce((s,g) => s + parseFloat(g.units||3), 0)).toFixed(2) : '-';
  const encodedItems = grades.reduce((sum, g) => sum + (g.components?.length || 0), 0);
  const attendancePoints = grades.reduce((sum, g) => sum + parseFloat(g.attendance_summary?.total_points || 0), 0);
  const attendancePossible = grades.reduce((sum, g) => sum + parseFloat(g.attendance_summary?.possible_points || 0), 0);

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>Welcome, {user?.first_name}!</h1>
        <p>{user?.program || 'Student'} - {user?.student_id || ''}</p>
      </div>

      <div className="grid-4" style={{ marginBottom:'2rem' }}>
        {[
          { label:'Enrolled Subjects', value:grades.length, icon:<BookOpen size={22}/>, color:'var(--accent)' },
          { label:'GWA', value:gwa, icon:<Award size={22}/>, color:'var(--success)' },
          { label:'Attendance Points', value:`${attendancePoints.toFixed(0)}/${attendancePossible || 0}`, icon:<UserCheck size={22}/>, color:'var(--info)' },
          { label:'Encoded Items', value:encodedItems, icon:<ClipboardList size={22}/>, color:'var(--warning)' },
        ].map((c,i)=>(
          <div key={i} className="stat-card">
            <div className="flex-between">
              <div><div className="stat-value" style={{ color:c.color }}>{c.value}</div><div className="stat-label">{c.label}</div></div>
              <div style={{ color:c.color,opacity:0.5 }}>{c.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginBottom:'1rem',display:'flex',alignItems:'center',gap:'0.5rem' }}><Bell size={18}/>Notifications</h3>
        {notifications.length > 0 ? (
          <div style={{ display:'flex',flexDirection:'column',gap:'0.5rem' }}>
            {notifications.map(n => (
              <div key={n.id} style={{ padding:'0.75rem',background:n.is_read?'transparent':'var(--accent-muted)',borderRadius:'var(--radius-sm)',borderLeft:`3px solid ${n.is_read?'var(--border)':'var(--accent)'}` }}>
                <div style={{ fontWeight:500,fontSize:'0.875rem' }}>{n.title}</div>
                <div style={{ fontSize:'0.8125rem',color:'var(--text-secondary)' }}>{n.message}</div>
                <div style={{ fontSize:'0.75rem',color:'var(--text-muted)',marginTop:'0.25rem' }}>{new Date(n.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding:'1rem' }}>No notifications yet</div>
        )}
      </div>
    </div>
  );
}
