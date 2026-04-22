import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { BarChart3, Users, BookOpen, GraduationCap, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function DeanDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/reports/dashboard').then(r => setData(r.data.data)).catch(() => {});
  }, []);

  if (!data) return <div className="empty-state" style={{ marginTop:'4rem' }}>Loading dashboard...</div>;

  const { overview, grade_status_distribution, program_performance, recent_releases } = data;

  const statusMap = {};
  grade_status_distribution?.forEach(s => { statusMap[s.grade_status] = parseInt(s.count); });

  const pieData = [
    { name: 'Draft', value: statusMap.draft || 0, color: '#EAB308' },
    { name: 'Verified', value: statusMap.faculty_verified || 0, color: '#3B82F6' },
    { name: 'Released', value: statusMap.officially_released || 0, color: '#22C55E' },
  ].filter(d => d.value > 0);

  const perfData = program_performance?.map(p => ({
    name: p.program || 'N/A',
    avg: parseFloat(p.avg_score || 0).toFixed(1),
    passed: parseInt(p.passed || 0),
    failed: parseInt(p.failed || 0),
  })) || [];

  const roleLabel = user?.role === 'program_chair' ? 'Program Chair' : 'Dean';

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>{roleLabel} Monitoring Dashboard</h1>
        <p>Grade monitoring and academic performance overview</p>
      </div>

      <div className="grid-4" style={{ marginBottom:'2rem' }}>
        {[
          { label:'Students', value:overview.total_students, icon:<GraduationCap size={22}/>, color:'var(--success)' },
          { label:'Faculty', value:overview.total_faculty, icon:<Users size={22}/>, color:'var(--info)' },
          { label:'Classes', value:overview.total_classes, icon:<BookOpen size={22}/>, color:'var(--accent)' },
          { label:'Subjects', value:overview.total_subjects, icon:<BarChart3 size={22}/>, color:'var(--warning)' },
        ].map((c,i)=>(
          <div key={i} className="stat-card">
            <div className="flex-between">
              <div><div className="stat-value" style={{ color:c.color }}>{c.value}</div><div className="stat-label">{c.label}</div></div>
              <div style={{ color:c.color, opacity:0.5 }}>{c.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom:'2rem' }}>
        <div className="card">
          <h3 style={{ marginBottom:'1rem' }}>Program Performance (Avg Score %)</h3>
          {perfData.length ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={perfData} margin={{ top:5,right:20,left:0,bottom:5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fill:'var(--text-secondary)',fontSize:12 }} />
                <YAxis tick={{ fill:'var(--text-secondary)',fontSize:12 }} />
                <Tooltip contentStyle={{ background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text-primary)' }} />
                <Bar dataKey="avg" fill="var(--accent)" radius={[4,4,0,0]} name="Avg Score %" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="empty-state">No performance data</p>}
        </div>

        <div className="card">
          <h3 style={{ marginBottom:'1rem' }}>Grade Status Distribution</h3>
          {pieData.length ? (
            <div style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:'2rem' }}>
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" stroke="var(--bg-primary)" strokeWidth={2}>
                    {pieData.map((d,i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display:'flex',flexDirection:'column',gap:'0.75rem' }}>
                {pieData.map((d,i)=>(
                  <div key={i} style={{ display:'flex',alignItems:'center',gap:'0.5rem' }}>
                    <div style={{ width:12,height:12,borderRadius:3,background:d.color }} />
                    <span style={{ fontSize:'0.875rem' }}>{d.name}: <strong>{d.value}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="empty-state">No data</p>}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom:'1rem' }}>Recently Released Grades</h3>
        <div className="table-container">
          <table>
            <thead><tr><th>Subject</th><th>Section</th><th>Faculty</th><th>Released</th></tr></thead>
            <tbody>
              {recent_releases?.map((r,i)=>(
                <tr key={i}>
                  <td><strong>{r.code}</strong> – {r.name}</td>
                  <td>{r.section}</td>
                  <td style={{ color:'var(--text-secondary)' }}>{r.faculty}</td>
                  <td style={{ color:'var(--text-muted)',fontSize:'0.8125rem' }}>{r.released_at ? new Date(r.released_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
              {!recent_releases?.length && <tr><td colSpan={4} className="empty-state">No released grades yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
