import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Plus, X, Edit, Search, Clock, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
import './SubjectManagement.css';

const buildEmptySubjectForm = (program = '') => ({
  code: '',
  name: '',
  description: '',
  units: '3.0',
  department: 'College of Engineering',
  program: program || ''
});

const normalizeSubjectCodeKey = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const normalizeTextKey = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

export default function SubjectManagement() {
  const [subjects, setSubjects] = useState([]);
  const [filteredSubjects, setFilteredSubjects] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingSubject, setRejectingSubject] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(buildEmptySubjectForm());
  const [programOptions, setProgramOptions] = useState([]);
  const [toast, setToast] = useState(null);
  const [user, setUser] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);

  const fetchSubjects = (silent = false) => api.get('/subjects').then(r => {
    const data = r.data.data || [];
    setSubjects(data);
    setLastSynced(new Date());
  }).catch(err => {
    if (!silent) showToast(err.response?.data?.message || 'Unable to load subjects.', 'error');
  });
  
  useEffect(() => {
    api.get('/auth/me').then(r => {
      const currentUser = r.data.data;
      setUser(currentUser);
      setForm(prev => ({ ...prev, program: prev.program || currentUser?.program || '' }));
    });
    api.get('/subjects/programs').then(r => setProgramOptions(r.data.data || [])).catch(() => {});
  }, []);
  
  useEffect(() => {
    fetchSubjects();
    const intervalId = window.setInterval(() => fetchSubjects(true), 12000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    applyFilters(subjects, statusFilter, searchQuery);
  }, [subjects, statusFilter, searchQuery]);

  const applyFilters = (data, status, search) => {
    let filtered = data;
    
    if (status !== 'all') {
      filtered = filtered.filter(s => s.approval_status === status);
    }
    
    if (search.trim()) {
      const query = search.toLowerCase();
      filtered = filtered.filter(s => 
        s.code.toLowerCase().includes(query) || 
        s.name.toLowerCase().includes(query) ||
        (s.program && s.program.toLowerCase().includes(query))
      );
    }
    
    setFilteredSubjects(filtered);
  };

  const showToast = (m,t='success') => { setToast({msg:m,type:t}); setTimeout(()=>setToast(null),4000); };

  const openCreate = () => { setEditing(null); setForm(buildEmptySubjectForm(user?.program)); setShowModal(true); };
  const openEdit = (s) => { setEditing(s); setForm({...s}); setShowModal(true); };

  const programChoices = Array.from(new Set([...programOptions, user?.program].filter(Boolean))).sort();

  const findLocalDuplicate = () => {
    const codeKey = normalizeSubjectCodeKey(form.code);
    const nameKey = normalizeTextKey(form.name);
    const programKey = normalizeTextKey(form.program);

    return subjects.find(subject => {
      if (editing && Number(subject.id) === Number(editing.id)) return false;

      const sameCode = codeKey && normalizeSubjectCodeKey(subject.code) === codeKey;
      const sameNameProgram = nameKey &&
        normalizeTextKey(subject.name) === nameKey &&
        normalizeTextKey(subject.program) === programKey;

      return sameCode || sameNameProgram;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const duplicate = findLocalDuplicate();
    if (duplicate) {
      showToast(`Subject already exists as ${duplicate.code} - ${duplicate.name}.`, 'error');
      return;
    }

    try {
      if (editing) { 
        await api.put(`/subjects/${editing.id}`, form); 
        showToast('Subject updated.'); 
      } else { 
        const res = await api.post('/subjects', form); 
        const isPending = res.data.data?.approval_status === 'pending';
        showToast(isPending ? 'Subject created. Awaiting approval from Program Chair.' : 'Subject created and approved.', isPending ? 'info' : 'success'); 
      }
      setShowModal(false); fetchSubjects();
    } catch(err) { showToast(err.response?.data?.message||'Error','error'); }
  };

  const handleApprove = async (id) => {
    try {
      await api.post(`/subjects/${id}/approve`);
      showToast('Subject approved successfully.');
      fetchSubjects();
    } catch(err) { showToast(err.response?.data?.message||'Error','error'); }
  };

  const openRejectModal = (subject) => {
    setRejectingSubject(subject);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (rejectionReason.trim().length < 10) {
      showToast('Please add a cancellation reason with at least 10 characters.', 'error');
      return;
    }
    try {
      await api.post(`/subjects/${rejectingSubject.id}/cancel`, { reason: rejectionReason });
      showToast('Subject request cancelled.');
      setShowRejectModal(false);
      fetchSubjects();
    } catch(err) { showToast(err.response?.data?.message||'Error','error'); }
  };

  const getStatusBadge = (status) => {
    if (status === 'approved') return <span className="status-badge status-approved"><CheckCircle size={14}/>Approved</span>;
    if (status === 'rejected') return <span className="status-badge status-rejected"><XCircle size={14}/>Cancelled</span>;
    return <span className="status-badge status-pending"><Clock size={14}/>Pending</span>;
  };

  const canApprove = user && ['admin', 'program_chair'].includes(user.role);
  const pendingCount = subjects.filter(s => s.approval_status === 'pending').length;
  const approvedCount = subjects.filter(s => s.approval_status === 'approved').length;
  const rejectedCount = subjects.filter(s => s.approval_status === 'rejected').length;
  const formattedLastSynced = lastSynced
    ? lastSynced.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    : 'Syncing...';

  return (
    <div className="animate-in">
      <div className="page-header flex-between">
        <div>
          <h1>Subjects</h1>
          <p>Manage your academic subjects and track approval status</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={18}/>Add Subject</button>
      </div>
      
      {user && user.role === 'faculty' && (pendingCount > 0 || rejectedCount > 0) && (
        <div className="status-summary-cards">
          {pendingCount > 0 && (
            <div className="status-summary-card pending">
              <Clock size={20} />
              <div>
                <div className="summary-count">{pendingCount}</div>
                <div className="summary-label">Pending Approval</div>
              </div>
            </div>
          )}
          {rejectedCount > 0 && (
            <div className="status-summary-card rejected">
              <XCircle size={20} />
              <div>
                <div className="summary-count">{rejectedCount}</div>
                <div className="summary-label">Cancelled - Needs Revision</div>
              </div>
            </div>
          )}
          {approvedCount > 0 && (
            <div className="status-summary-card approved">
              <CheckCircle size={20} />
              <div>
                <div className="summary-count">{approvedCount}</div>
                <div className="summary-label">Approved & Active</div>
              </div>
            </div>
          )}
        </div>
      )}
      
      <div className="subject-filters">
        <div className="filter-tabs">
          <button 
            className={`filter-tab ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All Subjects
            {subjects.length > 0 && <span className="tab-count">{subjects.length}</span>}
          </button>
          <button 
            className={`filter-tab ${statusFilter === 'pending' ? 'active' : ''}`}
            onClick={() => setStatusFilter('pending')}
          >
            <Clock size={16}/>Pending
            {pendingCount > 0 && <span className="tab-count">{pendingCount}</span>}
          </button>
          <button 
            className={`filter-tab ${statusFilter === 'approved' ? 'active' : ''}`}
            onClick={() => setStatusFilter('approved')}
          >
            <CheckCircle size={16}/>Approved
            {approvedCount > 0 && <span className="tab-count">{approvedCount}</span>}
          </button>
          <button 
            className={`filter-tab ${statusFilter === 'rejected' ? 'active' : ''}`}
            onClick={() => setStatusFilter('rejected')}
          >
            <XCircle size={16}/>Cancelled
            {rejectedCount > 0 && <span className="tab-count">{rejectedCount}</span>}
          </button>
        </div>
        <div className="subject-live-sync"><Clock size={14}/>Live sync {formattedLastSynced}</div>
      </div>
      
      <div className="search-bar-container">
        <div className="search-bar">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search by code, name, or program..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}>
              <X size={16} />
            </button>
          )}
        </div>
        <div className="search-results-count">
          {searchQuery && `${filteredSubjects.length} of ${subjects.length} subjects`}
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Units</th><th>Program</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {filteredSubjects.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight:600, color:'var(--accent)' }}>{s.code}</td>
                <td>{s.name}</td>
                <td>{s.units}</td>
                <td style={{ color:'var(--text-secondary)' }}>{s.program||'General'}</td>
                <td>{getStatusBadge(s.approval_status)}</td>
                <td>
                  <div className="action-buttons">
                    {s.approval_status === 'pending' && canApprove && (
                      <>
                        <button className="btn btn-ghost btn-sm btn-success" onClick={() => handleApprove(s.id)} title="Approve">
                          <CheckCircle size={15}/>Approve
                        </button>
                        <button className="btn btn-ghost btn-sm btn-danger" onClick={() => openRejectModal(s)} title="Reject">
                          <XCircle size={15}/>Reject
                        </button>
                      </>
                    )}
                    {s.approval_status === 'rejected' && s.rejection_reason && (
                      <button className="btn btn-ghost btn-sm" onClick={() => { showToast(s.rejection_reason, 'info'); }} title="View reason">
                        <AlertCircle size={15}/>Reason
                      </button>
                    )}
                    {(user?.role === 'admin' || (Number(s.created_by) === Number(user?.id) && s.approval_status !== 'pending')) && (
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}><Edit size={15}/></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!filteredSubjects.length && searchQuery && <tr><td colSpan={6} className="empty-state">No subjects found matching "{searchQuery}"</td></tr>}
            {!subjects.length && !searchQuery && <tr><td colSpan={6} className="empty-state">No subjects yet</td></tr>}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <div className="flex-between" style={{ marginBottom:'1.5rem' }}><h2>{editing?'Edit':'Create'} Subject</h2><button className="btn btn-ghost btn-sm" onClick={()=>setShowModal(false)}><X size={18}/></button></div>
            <form onSubmit={handleSubmit} style={{ display:'flex',flexDirection:'column',gap:'1rem' }}>
              <div className="grid-2">
                <div className="input-group"><label htmlFor="sj-code">Code *</label><input id="sj-code" className="input-field" required value={form.code} onChange={e=>setForm({...form,code:e.target.value})} placeholder="e.g., CE 301"/></div>
                <div className="input-group"><label htmlFor="sj-units">Units *</label><input id="sj-units" type="number" step="0.5" className="input-field" required value={form.units} onChange={e=>setForm({...form,units:e.target.value})}/></div>
              </div>
              <div className="input-group"><label htmlFor="sj-name">Name *</label><input id="sj-name" className="input-field" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
              <div className="input-group"><label htmlFor="sj-desc">Description</label><textarea id="sj-desc" className="input-field" rows={3} value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})}/></div>
              <div className="input-group">
                <label htmlFor="sj-prog">Program</label>
                <select id="sj-prog" className="input-field" value={form.program||''} onChange={e=>setForm({...form,program:e.target.value})}>
                  <option value="">General / no program</option>
                  {programChoices.map(program => <option key={program} value={program}>{program}</option>)}
                </select>
              </div>
              <button type="submit" className="btn btn-primary">{editing?'Update':'Create'} Subject</button>
            </form>
          </div>
        </div>
      )}
      {showRejectModal && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()} style={{ maxWidth:'480px' }}>
            <div className="flex-between" style={{ marginBottom:'1.5rem' }}>
              <h2>Cancel Subject Request</h2>
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowRejectModal(false)}><X size={18}/></button>
            </div>
            <div className="rejection-subject-info">
              <div className="rejection-code">{rejectingSubject?.code}</div>
              <div className="rejection-name">{rejectingSubject?.name}</div>
            </div>
            <div className="input-group" style={{ marginTop:'1.5rem' }}>
              <label htmlFor="reject-reason">Cancellation Reason *</label>
              <textarea 
                id="reject-reason"
                className="input-field" 
                rows={4} 
                value={rejectionReason}
                onChange={e=>setRejectionReason(e.target.value)}
                placeholder="Explain what should be corrected before resubmission..."
                minLength={10}
                required
              />
              <small className="field-hint">{Math.min(rejectionReason.trim().length, 10)}/10 characters minimum</small>
            </div>
            <div className="flex-gap" style={{ marginTop:'1.5rem', justifyContent:'flex-end' }}>
              <button className="btn btn-secondary" onClick={()=>setShowRejectModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleReject}><XCircle size={18}/>Cancel Request</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
