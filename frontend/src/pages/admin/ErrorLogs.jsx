import { useState, useEffect } from 'react';
import api from '../../services/api';
import { AlertTriangle, Search, Server, MonitorSmartphone, XCircle } from 'lucide-react';

export default function ErrorLogs() {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sourceFilter, setSourceFilter] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ page, limit: 20 });
    if (sourceFilter) params.set('source', sourceFilter);
    api.get(`/error-logs?${params}`).then(r => {
      setLogs(r.data.data || []);
      setTotal(r.data.pagination?.total || 0);
    }).catch(() => {});
  }, [page, sourceFilter]);

  const totalPages = Math.ceil(total / 20);

  const getSourceIcon = (source) => {
    if (source === 'frontend') return <MonitorSmartphone size={14} className="text-info" />;
    return <Server size={14} className="text-danger" />;
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>System Error Logs</h1>
        <p>Frontend and backend exception tracking</p>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="flex-gap">
          <select 
            className="input-field" 
            style={{ width: '180px' }} 
            value={sourceFilter} 
            onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Sources</option>
            <option value="frontend">Frontend Errors</option>
            <option value="backend">Backend Errors</option>
          </select>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: '140px' }}>Timestamp</th>
              <th>Source</th>
              <th>Message</th>
              <th>Context</th>
              <th>User</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(l => {
              let contextText = '—';
              try {
                if (l.context) {
                  const data = typeof l.context === 'string' ? JSON.parse(l.context) : l.context;
                  contextText = Object.entries(data).map(([k,v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' | ');
                }
              } catch(e) { contextText = l.context; }

              return (
                <tr key={l.id}>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {new Date(l.created_at).toLocaleString()}
                  </td>
                  <td>
                    <span className={`badge ${l.source === 'frontend' ? 'badge-info' : 'badge-danger'}`} style={{ gap: '0.35rem' }}>
                      {getSourceIcon(l.source)} {l.source.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ color: 'var(--danger)', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <AlertTriangle size={14} />
                      {l.message}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.75rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={contextText}>
                    {contextText}
                  </td>
                  <td style={{ fontWeight: 500, fontSize: '0.8125rem' }}>
                    {l.user_name || 'Anonymous'}
                  </td>
                </tr>
              );
            })}
            {!logs.length && (
              <tr>
                <td colSpan={5} className="empty-state">
                  <XCircle size={48} style={{ opacity: 0.2, margin: '0 auto 1rem', display: 'block' }} />
                  <p>No errors found.</p>
                </td>
              </tr>
            )}
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
