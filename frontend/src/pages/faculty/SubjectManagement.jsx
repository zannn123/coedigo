import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Plus, X, Edit, Search, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

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
  const [form, setForm] = useState({ code:'', name:'', description:'', units:'3.0', department:'College of Engineering', program:'' });
  const [toast, setToast] = useState(null);
  const [user, setUser] = useState(null);

  const fetch = () => api.get('/subjects', { params: { status: statusFilter === 'all' ? null : statusFilter } }).then(r => {
    const data = r.data.data || [];
    setSubjects(data);
    setFilteredSubjects(data);
  });
  
  useEffect(() => {
    api.get('/auth/me').then(r => setUser(r.data.data));
  }, []);
  
  useEffect(() => { fetch(); }, [statusFilter]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredSubjects(subjects);
      return;
    }
    const query = searchQuery.toLowerCase();
    setFilteredSubjects(subjects.filter(s => 
      s.code.toLowerCase().includes(query) || 
      s.name.toLowerCase().includes(query) ||
      (s.program && s.program.toLowerCase().includes(query))
    ));
  }, [searchQuery, subjects]);

  const showToast = (m,t='success') => { setToast({msg:m,type:t}); setTimeout(()=>setToast(null),3000); };

  const openCreate = () => { setEditing(null); setForm({ code:'', name:'', description:'', units:'3.0', department:'College of Engineering', program:'' }); setShowModal(true); };
  const openEdit = (s) => { setEditing(s); setForm({...s}); setShowModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) { await api.put(`/subjects/${editing.id}`, form); showToast('Subject updated.'); }
      else { 
        const res = await api.post('/subjects', form); 
        const isPending = res.data.data?.approval_status === 'pending';
        showToast(isPending ? 'Subject created. Awaiting approval.' : 'Subject created.', isPending ? 'info' : 'success'); 
      }
      setShowModal(false); fetch();
    } catch(err) { showToast(err.response?.data?.message||'Error','error'); }
  };

  const handleApprove = async (id) => {
    try {
      await api.post(`/subjects/${id}/approve`);
      showToast('Subject approved successfully.');
      fetch();
    } catch(err) { showToast(err.response?.data?.message||'Error','error'); }
  };

  const openRejectModal = (subject) => {
    setRejectingSubject(subject);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      showToast('Please provide a reason for rejection.', 'error');
      return;
    }
    try {
      await api.post(`/subjects/${rejectingSubject.id}/reject`, { reason: rejectionReason });
      showToast('Subject rejected.');
      setShowRejectModal(false);
      fetch();
    } catch(err) { showToast(err.response?.data?.message||'Error','error'); }
  };

  const getStatusBadge = (status) => {
    if (status === 'approved') return <span className="status-badge status-approved"><CheckCircle size={14}/>Approved</span>;
    if (status === 'rejected') return <span className="status-badge status-rejected"><XCircle size={14}/>Rejected</span>;
    return <span className="status-badge status-pending"><Clock size={14}/>Pending</span>;
  };

  const canApprove = user && ['admin', 'program_chair'].includes(user.role);

  return (
    <div className="animate-in">
      <div className="page-header flex-between">
        <div><h1>Subjects</h1><p>Academic subject catalog</p></div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={18}/>Add Subject</button>
      </div>
      
      <div className="subject-filters">
        <div className="filter-tabs">
          <button 
            className={`filter-tab ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All Subjects
          </button>
          {canApprove && (
            <>
              <button 
                className={`filter-tab ${statusFilter === 'pending' ? 'active' : ''}`}
                onClick={() => setStatusFilter('pending')}
              >
                <Clock size={16}/>Pending
              </button>
              <button 
                className={`filter-tab ${statusFilter === 'approved' ? 'active' : ''}`}
                onClick={() => setStatusFilter('approved')}
              >
                <CheckCircle size={16}/>Approved
              </button>
              <button 
                className={`filter-tab ${statusFilter === 'rejected' ? 'active' : ''}`}
                onClick={() => setStatusFilter('rejected')}
              >
                <XCircle size={16}/>Rejected
              </button>
            </>
          )}
        </div>
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
                    {(user?.role === 'admin' || s.approval_status !== 'pending') && (
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
              <div className="input-group"><label htmlFor="sj-prog">Program</label><select id="sj-prog" className="input-field" value={form.program||''} onChange={e=>setForm({...form,program:e.target.value})}><option value="">General</option><option value="BSCE">BSCE</option><option value="BSEE">BSEE</option><option value="BSCpE">BSCpE</option><option value="BSME">BSME</option></select></div>
              <button type="submit" className="btn btn-primary">{editing?'Update':'Create'} Subject</button>
            </form>
          </div>
        </div>
      )}
      {showRejectModal && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()} style={{ maxWidth:'480px' }}>
            <div className="flex-between" style={{ marginBottom:'1.5rem' }}>
              <h2>Reject Subject</h2>
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowRejectModal(false)}><X size={18}/></button>
            </div>
            <div className="rejection-subject-info">
              <div className="rejection-code">{rejectingSubject?.code}</div>
              <div className="rejection-name">{rejectingSubject?.name}</div>
            </div>
            <div className="input-group" style={{ marginTop:'1.5rem' }}>
              <label htmlFor="reject-reason">Reason for Rejection *</label>
              <textarea 
                id="reject-reason"
                className="input-field" 
                rows={4} 
                value={rejectionReason}
                onChange={e=>setRejectionReason(e.target.value)}
                placeholder="Explain why this subject is being rejected..."
                required
              />
            </div>
            <div className="flex-gap" style={{ marginTop:'1.5rem', justifyContent:'flex-end' }}>
              <button className="btn btn-secondary" onClick={()=>setShowRejectModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleReject}><XCircle size={18}/>Reject Subject</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
