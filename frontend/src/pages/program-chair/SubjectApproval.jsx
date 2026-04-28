import { useState, useEffect, useCallback, useDeferredValue } from 'react';
import { Check, X, Search, Clock, CheckCheck, AlertCircle, BookOpen, User, GraduationCap, Hash } from 'lucide-react';
import api from '../../services/api';
import './SubjectApproval.css';

export default function SubjectApproval() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const deferredSearch = useDeferredValue(search);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchSubjects = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await api.get('/subjects');
      setSubjects(response.data?.data || []);
      setLastUpdated(new Date());
    } catch (error) {
      if (!silent) showToast('Failed to load subjects', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      fetchSubjects({ silent: true });
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [fetchSubjects]);

  const handleApprove = async (subjectId) => {
    setActionLoading(true);
    try {
      const response = await api.post(`/subjects/${subjectId}/approve`);
      const updatedSubject = response.data?.data?.subject;
      if (updatedSubject) {
        setSubjects(prev => prev.map(subject => subject.id === subjectId ? updatedSubject : subject));
      }
      showToast('Subject approved successfully', 'success');
      fetchSubjects({ silent: true });
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to approve subject', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    const reason = rejectReason.trim();
    if (!selectedSubject || reason.length < 10) {
      showToast('Please add a cancellation reason with at least 10 characters.', 'error');
      return;
    }
    
    setActionLoading(true);
    try {
      const response = await api.post(`/subjects/${selectedSubject.id}/cancel`, { reason });
      const updatedSubject = response.data?.data?.subject;
      if (updatedSubject) {
        setSubjects(prev => prev.map(subject => subject.id === selectedSubject.id ? updatedSubject : subject));
      }
      showToast('Subject request cancelled', 'success');
      setSelectedSubject(null);
      setRejectReason('');
      fetchSubjects({ silent: true });
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to cancel subject', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { icon: <Clock size={14} />, label: 'Pending', class: 'status-pending' },
      approved: { icon: <CheckCheck size={14} />, label: 'Approved', class: 'status-approved' },
      rejected: { icon: <AlertCircle size={14} />, label: 'Cancelled', class: 'status-rejected' }
    };
    const badge = badges[status] || badges.pending;
    return (
      <span className={`status-badge ${badge.class}`}>
        {badge.icon}
        {badge.label}
      </span>
    );
  };

  const pendingCount = subjects.filter(s => s.approval_status === 'pending').length;
  const approvedCount = subjects.filter(s => s.approval_status === 'approved').length;
  const cancelledCount = subjects.filter(s => s.approval_status === 'rejected').length;
  const filteredSubjects = subjects.filter(subject => {
    if (filter !== 'all' && subject.approval_status !== filter) {
      return false;
    }

    if (deferredSearch) {
      const searchLower = deferredSearch.toLowerCase();
      return subject.code.toLowerCase().includes(searchLower) ||
             subject.name.toLowerCase().includes(searchLower) ||
             (subject.program || '').toLowerCase().includes(searchLower) ||
             (subject.created_by_name || '').toLowerCase().includes(searchLower);
    }

    return true;
  });

  const formattedLastUpdated = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    : 'Syncing...';

  return (
    <div className="subject-approval-page">
      <div className="page-header">
        <div className="header-left">
          <h1>Subject Approvals</h1>
          {pendingCount > 0 && (
            <div className="pending-badge">
              {pendingCount}
            </div>
          )}
        </div>
      </div>

      <div className="filters-bar">
        <div className="filter-chips">
          <button
            className={`chip ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            <Clock size={14} />
            {pendingCount}
          </button>
          <button
            className={`chip ${filter === 'approved' ? 'active' : ''}`}
            onClick={() => setFilter('approved')}
          >
            <CheckCheck size={14} />
            {approvedCount}
          </button>
          <button
            className={`chip ${filter === 'rejected' ? 'active' : ''}`}
            onClick={() => setFilter('rejected')}
          >
            <AlertCircle size={14} />
            {cancelledCount}
          </button>
        </div>

        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading subjects...</div>
      ) : filteredSubjects.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={48} />
          <h3>No subjects found</h3>
          <p>
            {filter === 'pending' 
              ? 'No subjects awaiting approval' 
              : `No ${filter === 'rejected' ? 'cancelled' : filter} subjects`}
          </p>
        </div>
      ) : (
        <div className="subjects-list">
          {filteredSubjects.map(subject => (
            <div key={subject.id} className={`approval-card ${subject.approval_status}`}>
              <div className="card-left">
                <div className="subject-code">{subject.code}</div>
                <div className="subject-title">{subject.name}</div>
                <div className="subject-info">
                  <span className="info-item">
                    <Hash size={12} />
                    {subject.units}u
                  </span>
                  {subject.program && (
                    <span className="info-item">
                      <GraduationCap size={12} />
                      {subject.program}
                    </span>
                  )}
                  {subject.created_by_name && (
                    <span className="info-item">
                      <User size={12} />
                      {subject.created_by_name}
                    </span>
                  )}
                </div>
              </div>

              <div className="card-right">
                {subject.approval_status === 'pending' ? (
                  <div className="action-buttons">
                    <button
                      className="btn-approve"
                      onClick={() => handleApprove(subject.id)}
                      disabled={actionLoading}
                      title="Approve"
                    >
                      <Check size={20} />
                    </button>
                    <button
                      className="btn-reject"
                      onClick={() => setSelectedSubject(subject)}
                      disabled={actionLoading}
                      title="Reject"
                    >
                      <X size={20} />
                    </button>
                  </div>
                ) : (
                  <div className="status-indicator">
                    {subject.approval_status === 'approved' ? (
                      <CheckCheck size={20} className="status-icon approved" />
                    ) : (
                      <AlertCircle size={20} className="status-icon rejected" />
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedSubject && (
        <div className="modal-overlay" onClick={() => { setSelectedSubject(null); setRejectReason(''); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Reject Subject</h2>
              <button className="modal-close" onClick={() => { setSelectedSubject(null); setRejectReason(''); }}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-subject">
              <div className="modal-code">{selectedSubject.code}</div>
              <div className="modal-name">{selectedSubject.name}</div>
            </div>

            <textarea
              className="reject-textarea"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (min 10 characters)..."
              rows={4}
              autoFocus
            />

            <div className="modal-actions">
              <button
                className="btn-modal-cancel"
                onClick={() => {
                  setSelectedSubject(null);
                  setRejectReason('');
                }}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                className="btn-modal-reject"
                onClick={handleReject}
                disabled={actionLoading || rejectReason.trim().length < 10}
              >
                {actionLoading ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
