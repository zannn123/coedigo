import { useState, useEffect } from 'react';
import api from '../../services/api';
import { UserCheck, UserX, Eye, X, Clock, CheckCircle, XCircle, ChevronDown } from 'lucide-react';

const STATUS_LABELS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
const STATUS_BADGES = { pending: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger' };
const ROLE_BADGES = { student: 'badge-success', faculty: 'badge-info', dean: 'badge-warning', program_chair: 'badge-accent' };

export default function AccountRequests() {
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('pending');
  const [toast, setToast] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/account-requests?status=${status}&page=${page}`);
      setRequests(res.data.data || []);
      setTotal(res.data.pagination?.total || 0);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, [page, status]);

  const showToast = (msg, type = 'success', dur = 4000) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), dur);
  };

  const handleApprove = async (req) => {
    if (!confirm(`Approve and create account for ${req.first_name} ${req.last_name} (${req.email})?`)) return;
    setActionLoading(req.id);
    try {
      const res = await api.post(`/account-requests/${req.id}/approve`);
      const tempPw = res.data?.data?.temporary_password;
      const emailSent = res.data?.data?.email_sent;
      let msg = res.data?.message || 'Account approved.';
      if (tempPw) msg += ` Temporary password: ${tempPw}`;
      if (!emailSent) msg += ' (Welcome email could not be sent)';
      showToast(msg, 'success', tempPw ? 12000 : 4000);
      fetchRequests();
      if (viewing?.id === req.id) setViewing(null);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to approve.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (req) => {
    if (!confirm(`Reject request from ${req.first_name} ${req.last_name}? The uploaded ID photo will be deleted.`)) return;
    setActionLoading(req.id);
    try {
      await api.post(`/account-requests/${req.id}/reject`);
      showToast('Request rejected and ID photo deleted.');
      fetchRequests();
      if (viewing?.id === req.id) setViewing(null);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to reject.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const getPhotoUrl = (id) => {
    const token = localStorage.getItem('coedigo_token');
    const base = import.meta.env.VITE_API_BASE_URL || '/api';
    return `${base}/account-requests/${id}/photo?token=${token}`;
  };

  const totalPages = Math.ceil(total / 20);
  const pendingCount = status === 'pending' ? total : null;

  return (
    <div className="animate-in">
      <div className="page-header flex-between">
        <div>
          <h1>Account Requests</h1>
          <p>Review and approve incoming account registrations</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="flex-gap" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Status:</span>
          {['pending', 'approved', 'rejected'].map(s => (
            <button
              key={s}
              className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setStatus(s); setPage(1); }}
              style={{ textTransform: 'capitalize' }}
            >
              {s === 'pending' && <Clock size={14} />}
              {s === 'approved' && <CheckCircle size={14} />}
              {s === 'rejected' && <XCircle size={14} />}
              {s}
            </button>
          ))}
          {pendingCount !== null && pendingCount > 0 && (
            <span className="badge badge-warning" style={{ marginLeft: '0.5rem' }}>{pendingCount} pending</span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Program</th>
              <th>ID</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="empty-state">Loading…</td></tr>
            ) : requests.length === 0 ? (
              <tr><td colSpan={8} className="empty-state">No {status} requests</td></tr>
            ) : requests.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500 }}>
                  {r.last_name}, {r.first_name} {r.middle_name || ''} {r.suffix || ''}
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>{r.email}</td>
                <td><span className={`badge ${ROLE_BADGES[r.role] || ''}`}>{r.role?.replace('_', ' ')}</span></td>
                <td style={{ color: 'var(--text-secondary)' }}>{r.program || '—'}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                  {r.student_id || r.employee_id || '—'}
                </td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                  {new Date(r.created_at).toLocaleDateString()}
                </td>
                <td><span className={`badge ${STATUS_BADGES[r.status]}`}>{STATUS_LABELS[r.status]}</span></td>
                <td>
                  <div className="flex-gap">
                    <button className="btn btn-ghost btn-sm" onClick={() => setViewing(r)} title="View details">
                      <Eye size={15} />
                    </button>
                    {r.status === 'pending' && (
                      <>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--success)' }}
                          onClick={() => handleApprove(r)}
                          disabled={actionLoading === r.id}
                          title="Approve"
                        >
                          <UserCheck size={15} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => handleReject(r)}
                          disabled={actionLoading === r.id}
                          title="Reject"
                        >
                          <UserX size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex-gap" style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}

      {/* Detail modal */}
      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
              <h2>Account Request Details</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setViewing(null)}><X size={18} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
              <DetailField label="First Name" value={viewing.first_name} />
              <DetailField label="Last Name" value={viewing.last_name} />
              <DetailField label="Middle Name" value={viewing.middle_name} />
              <DetailField label="Suffix" value={viewing.suffix} />
              <DetailField label="Email" value={viewing.email} span={2} />
              <DetailField label="Role" value={viewing.role?.replace('_', ' ')} />
              <DetailField label="Program" value={viewing.program} />
              <DetailField label={viewing.role === 'student' ? 'Student ID' : 'Employee ID'} value={viewing.student_id || viewing.employee_id} />
              <DetailField label="Year Level" value={viewing.year_level ? `${viewing.year_level}${['st','nd','rd'][viewing.year_level-1]||'th'} Year` : null} />
              <DetailField label="Contact" value={viewing.contact_number} />
              <DetailField label="Department" value={viewing.department} />
              {viewing.note && <DetailField label="Note" value={viewing.note} span={2} />}
            </div>

            {/* ID Photo */}
            {viewing.id_photo && viewing.status === 'pending' && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Uploaded ID Photo</label>
                <img
                  src={getPhotoUrl(viewing.id)}
                  alt="Uploaded ID"
                  style={{ maxWidth: '100%', maxHeight: '260px', borderRadius: '8px', border: '1px solid var(--border)', objectFit: 'contain', background: 'var(--bg-secondary)' }}
                />
              </div>
            )}

            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Submitted {new Date(viewing.created_at).toLocaleString()}
              {viewing.resolved_at && <> · Resolved {new Date(viewing.resolved_at).toLocaleString()}</>}
            </div>

            {viewing.status === 'pending' && (
              <div className="flex-gap">
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={() => handleApprove(viewing)}
                  disabled={actionLoading === viewing.id}
                >
                  <UserCheck size={16} /> Approve & Create Account
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1, color: 'var(--danger)' }}
                  onClick={() => handleReject(viewing)}
                  disabled={actionLoading === viewing.id}
                >
                  <UserX size={16} /> Reject
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

function DetailField({ label, value, span }) {
  return (
    <div style={{ gridColumn: span === 2 ? '1 / -1' : undefined }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '0.9375rem', color: 'var(--text-primary)', fontWeight: 500 }}>{value || '—'}</div>
    </div>
  );
}
