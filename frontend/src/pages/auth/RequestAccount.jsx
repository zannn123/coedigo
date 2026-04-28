import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Upload, ArrowLeft, CheckCircle, AlertCircle, X } from 'lucide-react';
import './RequestAccount.css';

const PROGRAMS = ['BSCE', 'BSEE', 'BSCpE', 'BSME', 'BSEcE'];

export default function RequestAccount() {
  const [form, setForm] = useState({
    first_name: '', middle_name: '', last_name: '', suffix: '',
    email: '', role: 'student', department: 'College of Engineering',
    program: '', year_level: '', student_id: '', employee_id: '',
    contact_number: '', note: '',
  });
  const [idPhoto, setIdPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { type: 'success'|'error', msg }

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setResult({ type: 'error', msg: 'File must be under 5 MB.' });
      return;
    }
    setIdPhoto(file);
    setPreview(URL.createObjectURL(file));
  };

  const removePhoto = () => {
    setIdPhoto(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setResult(null);
    setLoading(true);

    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
    if (idPhoto) fd.append('id_photo', idPhoto);

    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
      const res = await fetch(`${apiBase}/account-requests`, { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Request failed.');
      setResult({ type: 'success', msg: json.message || 'Request submitted!' });
      setForm({ first_name: '', middle_name: '', last_name: '', suffix: '', email: '', role: 'student', department: 'College of Engineering', program: '', year_level: '', student_id: '', employee_id: '', contact_number: '', note: '' });
      removePhoto();
    } catch (err) {
      setResult({ type: 'error', msg: err.message });
    } finally {
      setLoading(false);
    }
  };

  const isStudent = form.role === 'student';

  return (
    <div className="req-page">
      <div className="req-shell animate-in">

        {/* Left visual panel */}
        <section className="req-visual" aria-label="Request account overview">
          <div className="req-visual-brand">
            <img src="/coedigo-brand-logo.png" alt="" />
            <span>C.O.E.D.I.G.O.</span>
          </div>
          <div className="req-visual-copy">
            <span>JRMSU College of Engineering</span>
            <h2>Request your account to get started.</h2>
            <p className="req-visual-desc">Fill out the form and upload your school or government-issued ID. The admin will review and create your account.</p>
          </div>
        </section>

        {/* Right form panel */}
        <section className="req-panel" aria-labelledby="req-title">
          <Link to="/login" className="req-back-link"><ArrowLeft size={16} /> Back to login</Link>

          <div className="req-header">
            <h1 id="req-title">Request for Account</h1>
            <p className="req-subtitle">Submit your information for admin review.</p>
          </div>

          {result?.type === 'success' ? (
            <div className="req-success-card">
              <CheckCircle size={44} />
              <h3>Account Request Submitted Successfully!</h3>
              <p>{result.msg}</p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Make sure to check your inbox (and spam folder) for the welcome email.
              </p>
              <Link to="/login" className="btn btn-primary" style={{ marginTop: '1.25rem' }}>Return to Login</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="req-form">
              {result?.type === 'error' && (
                <div className="req-error"><AlertCircle size={16} /> {result.msg}</div>
              )}

              {/* Name */}
              <div className="req-grid-2">
                <div className="input-group">
                  <label htmlFor="req-fn">First Name *</label>
                  <input id="req-fn" className="input-field" required value={form.first_name} onChange={e => set('first_name', e.target.value)} />
                </div>
                <div className="input-group">
                  <label htmlFor="req-ln">Last Name *</label>
                  <input id="req-ln" className="input-field" required value={form.last_name} onChange={e => set('last_name', e.target.value)} />
                </div>
              </div>
              <div className="req-grid-2">
                <div className="input-group">
                  <label htmlFor="req-mn">Middle Name</label>
                  <input id="req-mn" className="input-field" value={form.middle_name} onChange={e => set('middle_name', e.target.value)} />
                </div>
                <div className="input-group">
                  <label htmlFor="req-suffix">Suffix</label>
                  <input id="req-suffix" className="input-field" placeholder="Jr., III, etc." value={form.suffix} onChange={e => set('suffix', e.target.value)} />
                </div>
              </div>

              {/* Email */}
              <div className="input-group">
                <label htmlFor="req-email">Email Address *</label>
                <input id="req-email" type="email" className="input-field" placeholder="you@jrmsu.edu.ph" required value={form.email} onChange={e => set('email', e.target.value)} />
              </div>

              {/* Role + Program */}
              <div className="req-grid-2">
                <div className="input-group">
                  <label htmlFor="req-role">Role *</label>
                  <select id="req-role" className="input-field" required value={form.role} onChange={e => set('role', e.target.value)}>
                    <option value="student">Student</option>
                    <option value="faculty">Faculty</option>
                    <option value="dean">Dean</option>
                    <option value="program_chair">Program Chair</option>
                  </select>
                </div>
                <div className="input-group">
                  <label htmlFor="req-prog">Program</label>
                  <select id="req-prog" className="input-field" value={form.program} onChange={e => set('program', e.target.value)}>
                    <option value="">Select…</option>
                    {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {/* ID + Year level */}
              <div className="req-grid-2">
                <div className="input-group">
                  <label htmlFor="req-sid">{isStudent ? 'Student ID' : 'Employee ID'}</label>
                  <input id="req-sid" className="input-field" value={isStudent ? form.student_id : form.employee_id} onChange={e => set(isStudent ? 'student_id' : 'employee_id', e.target.value)} />
                </div>
                <div className="input-group">
                  <label htmlFor="req-yl">Year Level</label>
                  <select id="req-yl" className="input-field" value={form.year_level} onChange={e => set('year_level', e.target.value)}>
                    <option value="">N/A</option>
                    <option value="1">1st Year</option>
                    <option value="2">2nd Year</option>
                    <option value="3">3rd Year</option>
                    <option value="4">4th Year</option>
                    <option value="5">5th Year</option>
                  </select>
                </div>
              </div>

              {/* Contact */}
              <div className="input-group">
                <label htmlFor="req-cn">Contact Number</label>
                <input id="req-cn" className="input-field" value={form.contact_number} onChange={e => set('contact_number', e.target.value)} />
              </div>

              {/* ID photo upload */}
              <div className="input-group">
                <label>School ID Photo *</label>
                {preview ? (
                  <div className="req-photo-preview">
                    <img src={preview} alt="ID preview" />
                    <button type="button" className="req-photo-remove" onClick={removePhoto} title="Remove photo"><X size={14} /></button>
                  </div>
                ) : (
                  <label className="req-upload-zone" htmlFor="req-id-file">
                    <Upload size={24} />
                    <span>Click to upload your ID photo</span>
                    <span className="req-upload-hint">JPEG, PNG, or WebP — max 5 MB</span>
                    <input id="req-id-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} hidden />
                  </label>
                )}
              </div>

              {/* Optional note */}
              <div className="input-group">
                <label htmlFor="req-note">Additional Note (optional)</label>
                <textarea id="req-note" className="input-field" rows={3} placeholder="Anything the admin should know..." value={form.note} onChange={e => set('note', e.target.value)} />
              </div>

              <button type="submit" className="btn btn-primary req-submit-btn" disabled={loading}>
                {loading ? <span className="spinner" /> : <UserPlus size={18} />}
                {loading ? 'Submitting…' : 'Submit Request'}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
