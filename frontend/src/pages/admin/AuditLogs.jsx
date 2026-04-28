import { useState, useEffect } from 'react';
import api from '../../services/api';
import { ScrollText, Search } from 'lucide-react';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ page, limit: 20 });
    if (actionFilter) params.set('action', actionFilter);
    api.get(`/audit-logs?${params}`).then(r => {
      setLogs(r.data.data || []);
      setTotal(r.data.pagination?.total || 0);
    }).catch(() => {});
  }, [page, actionFilter]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="animate-in">
      <div className="page-header"><h1>Activity Logs</h1><p>System-wide audit trail</p></div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="flex-gap">
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input-field" style={{ width: '100%', paddingLeft: '2.25rem' }} placeholder="Filter by action..." value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }} />
          </div>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead><tr><th>Timestamp</th><th>User</th><th>Role</th><th>Action</th><th>Entity</th><th>Details</th><th>IP Address</th></tr></thead>
          <tbody>
            {logs.map(l => {
              let details = '—';
              try {
                if (l.new_values) {
                  const data = JSON.parse(l.new_values);
                  details = Object.entries(data).map(([k,v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' | ');
                } else if (l.old_values) {
                  const data = JSON.parse(l.old_values);
                  details = `Prev: ${Object.entries(data).map(([k,v]) => `${k}: ${v}`).join(' | ')}`;
                }
              } catch(e) { details = l.new_values || l.old_values || '—'; }

              return (
              <tr key={l.id}>
                <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString()}</td>
                <td style={{ fontWeight: 500 }}>{l.user_name || 'System'}</td>
                <td><span className="badge badge-accent">{l.user_role || '—'}</span></td>
                <td style={{ fontWeight: 500 }}>{l.action?.replace(/_/g, ' ')}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{l.entity_type ? `${l.entity_type} #${l.entity_id}` : '—'}</td>
                <td style={{ fontSize: '0.75rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={details}>{details}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{l.ip_address || '—'}</td>
              </tr>
              );
            })}
            {!logs.length && <tr><td colSpan={6} className="empty-state">No logs found</td></tr>}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex-gap" style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
          <button className="btn btn-secondary btn-sm" disabled={page<=1} onClick={() => setPage(p=>p-1)}>Previous</button>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
          <button className="btn btn-secondary btn-sm" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)}>Next</button>
        </div>
      )}
    </div>
  );
}
