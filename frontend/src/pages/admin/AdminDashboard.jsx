import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Users, BookOpen, GraduationCap, ClipboardList, TrendingUp, Activity } from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api.get('/users/stats').then(r => setStats(r.data.data)).catch(() => {});
    api.get('/audit-logs?limit=8').then(r => setLogs(r.data.data || [])).catch(() => {});
  }, []);

  const roleCounts = {};
  stats?.by_role?.forEach(r => { roleCounts[r.role] = r.count; });

  const cards = [
    { label: 'Total Users', value: stats?.total_active || 0, icon: <Users size={22} />, color: 'var(--accent)' },
    { label: 'Faculty', value: roleCounts.faculty || 0, icon: <BookOpen size={22} />, color: 'var(--info)' },
    { label: 'Students', value: roleCounts.student || 0, icon: <GraduationCap size={22} />, color: 'var(--success)' },
    { label: 'Programs', value: stats?.students_by_program?.length || 0, icon: <ClipboardList size={22} />, color: 'var(--warning)' },
  ];

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>Admin Dashboard</h1>
        <p>System overview and management</p>
      </div>

      <div className="grid-4" style={{ marginBottom: '2rem' }}>
        {cards.map((c, i) => (
          <div key={i} className="stat-card">
            <div className="flex-between">
              <div>
                <div className="stat-value" style={{ color: c.color }}>{c.value}</div>
                <div className="stat-label">{c.label}</div>
              </div>
              <div style={{ color: c.color, opacity: 0.5 }}>{c.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={18} /> Students by Program
          </h3>
          {stats?.students_by_program?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {stats.students_by_program.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontWeight: 500 }}>{p.program || 'Unassigned'}</span>
                  <span className="badge badge-accent">{p.count}</span>
                </div>
              ))}
            </div>
          ) : <p className="empty-state">No program data available</p>}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={18} /> Recent Activity
          </h3>
          {logs.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {logs.map((log, i) => (
                <div key={i} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.8125rem' }}>
                  <div className="flex-between">
                    <span style={{ fontWeight: 500 }}>{log.action.replace(/_/g, ' ')}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{log.user_name || 'System'}</span>
                </div>
              ))}
            </div>
          ) : <p className="empty-state">No recent activity</p>}
        </div>
      </div>
    </div>
  );
}
