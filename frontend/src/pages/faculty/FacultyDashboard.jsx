import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { BookOpen, Users, CheckCircle, Clock, AlertCircle } from 'lucide-react';

export default function FacultyDashboard() {
  const [classes, setClasses] = useState([]);
  const navigate = useNavigate();

  useEffect(() => { api.get('/classes').then(r => setClasses(r.data.data || [])).catch(() => {}); }, []);

  const draft = classes.filter(c => c.grade_status === 'draft').length;
  const verified = classes.filter(c => c.grade_status === 'faculty_verified').length;
  const released = classes.filter(c => c.grade_status === 'officially_released').length;
  const totalStudents = classes.reduce((s, c) => s + (parseInt(c.student_count) || 0), 0);

  const statusIcon = { draft: <Clock size={14} />, faculty_verified: <AlertCircle size={14} />, officially_released: <CheckCircle size={14} /> };
  const statusBadge = { draft: 'badge-warning', faculty_verified: 'badge-info', officially_released: 'badge-success' };

  return (
    <div className="animate-in">
      <div className="page-header"><h1>Faculty Dashboard</h1><p>Your classes and grading overview</p></div>

      <div className="grid-4" style={{ marginBottom: '2rem' }}>
        {[
          { label: 'My Classes', value: classes.length, icon: <BookOpen size={22} />, color: 'var(--accent)' },
          { label: 'Total Students', value: totalStudents, icon: <Users size={22} />, color: 'var(--info)' },
          { label: 'Draft', value: draft, icon: <Clock size={22} />, color: 'var(--warning)' },
          { label: 'Released', value: released, icon: <CheckCircle size={22} />, color: 'var(--success)' },
        ].map((c, i) => (
          <div key={i} className="stat-card">
            <div className="flex-between">
              <div><div className="stat-value" style={{ color: c.color }}>{c.value}</div><div className="stat-label">{c.label}</div></div>
              <div style={{ color: c.color, opacity: 0.5 }}>{c.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>My Class Records</h3>
        {classes.length ? (
          <div className="table-container">
            <table>
              <thead><tr><th>Subject</th><th>Section</th><th>Semester</th><th>Students</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {classes.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.subject_code}</strong> – {c.subject_name}</td>
                    <td>{c.section}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{c.semester} {c.academic_year}</td>
                    <td>{c.student_count || 0}</td>
                    <td><span className={`badge ${statusBadge[c.grade_status]}`}>{statusIcon[c.grade_status]} {c.grade_status?.replace('_', ' ')}</span></td>
                    <td><button className="btn btn-secondary btn-sm" onClick={() => navigate(`/faculty/classes/${c.id}`)}>Manage</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty-state">No class records yet. Create one to get started.</p>}
      </div>
    </div>
  );
}
