import { useState, useEffect } from 'react';
import api from '../../services/api';
import { UserPlus, Search, Edit, Trash2, X } from 'lucide-react';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ first_name:'', last_name:'', middle_name:'', email:'', password:'', role:'student', department:'College of Engineering', program:'', year_level:'', student_id:'', employee_id:'', contact_number:'' });
  const [toast, setToast] = useState(null);

  const fetchUsers = () => {
    const params = new URLSearchParams({ page, limit: 15 });
    if (search) params.set('search', search);
    if (roleFilter) params.set('role', roleFilter);
    api.get(`/users?${params}`).then(r => { setUsers(r.data.data); setTotal(r.data.pagination?.total || 0); }).catch(() => {});
  };

  useEffect(() => { fetchUsers(); }, [page, roleFilter]);

  const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const openCreate = () => { setEditing(null); setForm({ first_name:'', last_name:'', middle_name:'', email:'', password:'', role:'student', department:'College of Engineering', program:'', year_level:'', student_id:'', employee_id:'', contact_number:'' }); setShowModal(true); };

  const openEdit = (u) => { setEditing(u); setForm({ ...u, password:'' }); setShowModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await api.put(`/users/${editing.id}`, payload);
        showToast('User updated successfully.');
      } else {
        await api.post('/users', form);
        showToast('User created successfully.');
      }
      setShowModal(false); fetchUsers();
    } catch (err) { showToast(err.response?.data?.message || 'Error', 'error'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Deactivate this user?')) return;
    try { await api.delete(`/users/${id}`); showToast('User deactivated.'); fetchUsers(); }
    catch (err) { showToast(err.response?.data?.message || 'Error', 'error'); }
  };

  const totalPages = Math.ceil(total / 15);
  const roleColors = { admin: 'badge-danger', faculty: 'badge-info', student: 'badge-success', dean: 'badge-warning', program_chair: 'badge-accent' };

  return (
    <div className="animate-in">
      <div className="page-header flex-between">
        <div><h1>User Management</h1><p>Manage system accounts and roles</p></div>
        <button className="btn btn-primary" onClick={openCreate}><UserPlus size={18} />Add User</button>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="flex-gap" style={{ flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input-field" style={{ width: '100%', paddingLeft: '2.25rem' }} placeholder="Search by name, email, or ID..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchUsers()} />
          </div>
          <select className="input-field" value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }}>
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="faculty">Faculty</option>
            <option value="student">Student</option>
            <option value="dean">Dean</option>
            <option value="program_chair">Program Chair</option>
          </select>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead><tr><th>Name</th><th>ID</th><th>Email</th><th>Role</th><th>Program</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 500 }}>{u.last_name}, {u.first_name} {u.middle_name || ''}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{u.student_id || u.employee_id || '—'}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                <td><span className={`badge ${roleColors[u.role] || ''}`}>{u.role?.replace('_', ' ')}</span></td>
                <td style={{ color: 'var(--text-secondary)' }}>{u.program || '—'}</td>
                <td><span className={`badge ${u.is_active == 1 ? 'badge-success' : 'badge-danger'}`}>{u.is_active == 1 ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div className="flex-gap">
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)} title="Edit"><Edit size={15} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(u.id)} title="Deactivate"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!users.length && <tr><td colSpan={7} className="empty-state">No users found</td></tr>}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex-gap" style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p-1)}>Previous</button>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p+1)}>Next</button>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
              <h2>{editing ? 'Edit User' : 'Create User'}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="grid-2">
                <div className="input-group"><label htmlFor="um-fn">First Name *</label><input id="um-fn" className="input-field" required value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} /></div>
                <div className="input-group"><label htmlFor="um-ln">Last Name *</label><input id="um-ln" className="input-field" required value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} /></div>
              </div>
              <div className="grid-2">
                <div className="input-group"><label htmlFor="um-mn">Middle Name</label><input id="um-mn" className="input-field" value={form.middle_name || ''} onChange={e => setForm({...form, middle_name: e.target.value})} /></div>
                <div className="input-group"><label htmlFor="um-role">Role *</label><select id="um-role" className="input-field" value={form.role} onChange={e => setForm({...form, role: e.target.value})} required><option value="student">Student</option><option value="faculty">Faculty</option><option value="admin">Admin</option><option value="dean">Dean</option><option value="program_chair">Program Chair</option></select></div>
              </div>
              <div className="input-group"><label htmlFor="um-email">Email *</label><input id="um-email" type="email" className="input-field" required value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
              <div className="input-group"><label htmlFor="um-pw">{editing ? 'New Password (leave blank to keep)' : 'Password *'}</label><input id="um-pw" type="password" className="input-field" required={!editing} minLength={8} value={form.password} onChange={e => setForm({...form, password: e.target.value})} /></div>
              <div className="grid-2">
                <div className="input-group"><label htmlFor="um-sid">{form.role === 'student' ? 'Student ID' : 'Employee ID'}</label><input id="um-sid" className="input-field" value={form.role === 'student' ? (form.student_id || '') : (form.employee_id || '')} onChange={e => setForm({...form, [form.role === 'student' ? 'student_id' : 'employee_id']: e.target.value})} /></div>
                <div className="input-group"><label htmlFor="um-prog">Program</label><select id="um-prog" className="input-field" value={form.program || ''} onChange={e => setForm({...form, program: e.target.value})}><option value="">Select...</option><option value="BSCE">BSCE</option><option value="BSEE">BSEE</option><option value="BSCpE">BSCpE</option><option value="BSME">BSME</option><option value="BSEcE">BSEcE</option></select></div>
              </div>
              <div className="grid-2">
                <div className="input-group"><label htmlFor="um-yl">Year Level</label><select id="um-yl" className="input-field" value={form.year_level || ''} onChange={e => setForm({...form, year_level: e.target.value})}><option value="">N/A</option><option value="1">1st Year</option><option value="2">2nd Year</option><option value="3">3rd Year</option><option value="4">4th Year</option><option value="5">5th Year</option></select></div>
                <div className="input-group"><label htmlFor="um-cn">Contact</label><input id="um-cn" className="input-field" value={form.contact_number || ''} onChange={e => setForm({...form, contact_number: e.target.value})} /></div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>{editing ? 'Update User' : 'Create User'}</button>
            </form>
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
