import { useEffect, useMemo, useState } from 'react';
import { LockKeyhole, Mail, Phone, Send, ShieldCheck, UserRoundCog } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import './AccountSettings.css';

const requestTypeOptions = [
  { value: 'profile_update', label: 'Profile update' },
  { value: 'email_change', label: 'Email change' },
  { value: 'contact_change', label: 'Contact number change' },
  { value: 'student_record', label: 'Student record correction' },
  { value: 'employee_record', label: 'Employee record correction' },
  { value: 'other', label: 'Other' },
];

export default function AccountSettings() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [requestForm, setRequestForm] = useState({
    request_type: 'profile_update',
    requested_email: '',
    requested_contact_number: '',
    note: '',
  });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let mounted = true;

    api.get('/auth/me')
      .then(response => {
        if (mounted) {
          setProfile(response.data.data);
        }
      })
      .catch(() => {
        if (mounted) {
          setProfile(user);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoadingProfile(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [user]);

  const showToast = (msg, type = 'success', duration = 4000) => {
    setToast({ msg, type });
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => setToast(null), duration);
  };

  const profileRows = useMemo(() => ([
    { label: 'Full name', value: profile ? [profile.first_name, profile.middle_name, profile.last_name, profile.suffix].filter(Boolean).join(' ') : '—' },
    { label: 'Email', value: profile?.email || '—' },
    { label: 'Role', value: profile?.role ? profile.role.replace('_', ' ') : '—' },
    { label: 'Program', value: profile?.program || '—' },
    { label: 'Student ID', value: profile?.student_id || '—' },
    { label: 'Employee ID', value: profile?.employee_id || '—' },
  ]), [profile]);

  const summaryRows = useMemo(() => ([
    { label: 'Email address', value: profile?.email || '—', icon: Mail },
    { label: 'Contact number', value: profile?.contact_number || '—', icon: Phone },
    { label: 'Program', value: profile?.program || '—', icon: ShieldCheck },
    { label: 'Student / Employee ID', value: profile?.student_id || profile?.employee_id || '—', icon: UserRoundCog },
  ]), [profile]);

  const userInitials = useMemo(() => {
    const first = profile?.first_name?.[0] || user?.first_name?.[0] || '';
    const last = profile?.last_name?.[0] || user?.last_name?.[0] || '';
    return `${first}${last}`.toUpperCase() || 'CO';
  }, [profile, user]);

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      showToast('New password and confirm password do not match.', 'error');
      return;
    }

    setPasswordBusy(true);
    try {
      const response = await api.put('/auth/password', {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });

      setPasswordForm({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
      await refreshUser();
      showToast(response.data?.message || 'Password changed successfully.');
    } catch (error) {
      const fieldErrors = error.response?.data?.errors;
      const fieldMessage = fieldErrors ? Object.values(fieldErrors).join(' ') : '';
      showToast([error.response?.data?.message, fieldMessage].filter(Boolean).join(' ') || 'Unable to change password.', 'error', 6000);
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleRequestSubmit = async (event) => {
    event.preventDefault();
    setRequestBusy(true);

    try {
      const response = await api.post('/auth/credential-request', requestForm);
      setRequestForm({
        request_type: 'profile_update',
        requested_email: '',
        requested_contact_number: '',
        note: '',
      });
      showToast(response.data?.message || 'Your request has been sent to the admin.');
    } catch (error) {
      const fieldErrors = error.response?.data?.errors;
      const fieldMessage = fieldErrors ? Object.values(fieldErrors).join(' ') : '';
      showToast([error.response?.data?.message, fieldMessage].filter(Boolean).join(' ') || 'Unable to send request.', 'error', 6000);
    } finally {
      setRequestBusy(false);
    }
  };

  return (
    <div className="account-settings-page animate-in">
      <div className="page-header account-page-header">
        <h1>Account Settings</h1>
        <p>Change your password yourself, and send admin requests only for email, contact, or record corrections that you cannot edit directly.</p>
      </div>

      <div className="account-settings-layout">
        <aside className="account-summary-column">
          <section className="card account-identity-card">
            <div className="account-identity-top">
              <div className="account-avatar">{userInitials}</div>
              <div className="account-identity-copy">
                <span className="account-chip">Active account</span>
                <h2>{profile ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') : 'Your account'}</h2>
                <p>{profile?.role ? profile.role.replace('_', ' ') : 'User'} access for the College of Engineering portal.</p>
              </div>
            </div>

            <div className="account-summary-stack">
              {summaryRows.map(item => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="account-summary-item">
                    <span className="account-summary-icon" aria-hidden="true">
                      <Icon size={15} />
                    </span>
                    <div>
                      <small>{item.label}</small>
                      <strong>{item.value}</strong>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="account-side-note">
              <strong>Use admin requests only for locked fields.</strong>
              <p>Email, contact number, and academic record corrections can be reviewed by admin when needed. Password updates stay self-service.</p>
            </div>
          </section>

          <div className="account-section-head">
            <div className="account-section-icon">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h2>Profile Snapshot</h2>
              <p>Reference your current account details before requesting corrections.</p>
            </div>
          </div>

          {loadingProfile ? (
            <p className="account-muted-copy">Loading account details...</p>
          ) : (
            <div className="account-profile-grid">
              {profileRows.map(item => (
                <div key={item.label} className="account-profile-row">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          )}
        </aside>

        <div className="account-main-column">
          <section className="card account-overview-card">
            <div className="account-overview-copy">
              <span className="account-chip">Quick guide</span>
              <h2>Keep the essentials in one place</h2>
              <p>Use the left side for reference, update your password in the secure form, and send admin requests only when a record field needs manual correction.</p>
            </div>

            <div className="account-overview-grid">
              <div>
                <strong>Self-service</strong>
                <span>Password updates happen here directly.</span>
              </div>
              <div>
                <strong>Admin review</strong>
                <span>Email, contact, and record corrections can be requested with notes.</span>
              </div>
              <div>
                <strong>Profile reference</strong>
                <span>Use your current data snapshot to avoid submitting incorrect requests.</span>
              </div>
            </div>
          </section>

          <section className="card account-action-card">
            <div className="account-section-head">
              <div className="account-section-icon">
                <LockKeyhole size={18} />
              </div>
              <div>
                <h2>Change Password</h2>
                <p>Password changes are self-service. Use your current password, then set a new one with at least 8 characters.</p>
              </div>
            </div>

            <div className="account-hint-row">
              <span className="account-inline-pill">No admin approval needed</span>
              <span className="account-inline-pill">Minimum 8 characters</span>
              <span className="account-inline-pill">Use your current password first</span>
            </div>

            <form className="account-form" onSubmit={handlePasswordSubmit}>
              <div className="input-group">
                <label htmlFor="current-password">Current password</label>
                <input
                  id="current-password"
                  type="password"
                  className="input-field"
                  value={passwordForm.current_password}
                  onChange={event => setPasswordForm(prev => ({ ...prev, current_password: event.target.value }))}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className="grid-2">
                <div className="input-group">
                  <label htmlFor="new-password">New password</label>
                  <input
                    id="new-password"
                    type="password"
                    className="input-field"
                    value={passwordForm.new_password}
                    onChange={event => setPasswordForm(prev => ({ ...prev, new_password: event.target.value }))}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="confirm-password">Confirm new password</label>
                  <input
                    id="confirm-password"
                    type="password"
                    className="input-field"
                    value={passwordForm.confirm_password}
                    onChange={event => setPasswordForm(prev => ({ ...prev, confirm_password: event.target.value }))}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary">
                <LockKeyhole size={16} />
                {passwordBusy ? 'Updating password...' : 'Update password'}
              </button>
            </form>
          </section>

          <section className="card account-action-card account-request-card">
            <div className="account-section-head">
              <div className="account-section-icon">
                <UserRoundCog size={18} />
              </div>
              <div>
                <h2>Request Admin Record Update</h2>
                <p>Use this only when your email, contact number, or academic record details need administrator review. Password changes do not need admin approval.</p>
              </div>
            </div>

            <div className="account-request-shell">
              <div className="account-request-guide">
                <strong>Good reasons to use this request</strong>
                <ul>
                  <li>Your institutional email needs correction</li>
                  <li>Your contact number in the system is outdated</li>
                  <li>Your student or employee record details are incorrect</li>
                </ul>
              </div>

              <form className="account-form" onSubmit={handleRequestSubmit}>
                <div className="grid-2">
                  <div className="input-group">
                    <label htmlFor="request-type">Request category</label>
                    <select
                      id="request-type"
                      className="input-field"
                      value={requestForm.request_type}
                      onChange={event => setRequestForm(prev => ({ ...prev, request_type: event.target.value }))}
                    >
                      {requestTypeOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="input-group">
                    <label htmlFor="requested-email">Requested email</label>
                    <input
                      id="requested-email"
                      type="email"
                      className="input-field"
                      value={requestForm.requested_email}
                      onChange={event => setRequestForm(prev => ({ ...prev, requested_email: event.target.value }))}
                      autoComplete="email"
                      placeholder="Only fill this if you want your email updated"
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label htmlFor="requested-contact">Requested contact number</label>
                  <input
                    id="requested-contact"
                    type="tel"
                    className="input-field"
                    value={requestForm.requested_contact_number}
                    onChange={event => setRequestForm(prev => ({ ...prev, requested_contact_number: event.target.value }))}
                    autoComplete="tel"
                    placeholder="Optional new contact number"
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="request-note">Note to admin</label>
                  <textarea
                    id="request-note"
                    className="input-field account-textarea"
                    value={requestForm.note}
                    onChange={event => setRequestForm(prev => ({ ...prev, note: event.target.value }))}
                    placeholder="Explain what should be corrected and include enough detail for the admin to verify your request."
                    minLength={10}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary">
                  <Send size={16} />
                  {requestBusy ? 'Sending request...' : 'Send request to admin'}
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
