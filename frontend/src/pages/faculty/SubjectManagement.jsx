import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Plus, X, Edit } from 'lucide-react';

export default function SubjectManagement() {
  const [subjects, setSubjects] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ code:'', name:'', description:'', units:'3.0', department:'College of Engineering', program:'' });
  const [toast, setToast] = useState(null);

  const fetch = () => api.get('/subjects').then(r => setSubjects(r.data.data||[]));
  useEffect(() => { fetch(); }, []);

  const showToast = (m,t='success') => { setToast({msg:m,type:t}); setTimeout(()=>setToast(null),3000); };

  const openCreate = () => { setEditing(null); setForm({ code:'', name:'', description:'', units:'3.0', department:'College of Engineering', program:'' }); setShowModal(true); };
  const openEdit = (s) => { setEditing(s); setForm({...s}); setShowModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) { await api.put(`/subjects/${editing.id}`, form); showToast('Subject updated.'); }
      else { await api.post('/subjects', form); showToast('Subject created.'); }
      setShowModal(false); fetch();
    } catch(err) { showToast(err.response?.data?.message||'Error','error'); }
  };

  return (
    <div className="animate-in">
      <div className="page-header flex-between">
        <div><h1>Subjects</h1><p>Academic subject catalog</p></div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={18}/>Add Subject</button>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Units</th><th>Program</th><th>Actions</th></tr></thead>
          <tbody>
            {subjects.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight:600, color:'var(--accent)' }}>{s.code}</td>
                <td>{s.name}</td>
                <td>{s.units}</td>
                <td style={{ color:'var(--text-secondary)' }}>{s.program||'General'}</td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}><Edit size={15}/></button></td>
              </tr>
            ))}
            {!subjects.length && <tr><td colSpan={5} className="empty-state">No subjects yet</td></tr>}
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
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
