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

const accountSections = [
  { id: 'profile', label: 'Profile', icon: UserRoundCog },
  { id: 'security', label: 'Security', icon: LockKeyhole },
  { id: 'requests', label: 'Requests', icon: Send },
];

const formatRole = role => (role ? role.replace(/_/g, ' ') : 'User');

const getFullName = person => (
  [person?.first_name, person?.middle_name, person?.last_name, person?.suffix]
    .filter(Boolean)
    .join(' ') || person?.email || 'Your account'
);

export default function AccountSettings() {
  const { user, refreshUser } = useAuth();
  const [activeSection, setActiveSection] = useState('profile');
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

  const displayProfile = profile || user || {};
  const displayName = getFullName(displayProfile);
  const roleLabel = formatRole(displayProfile.role);

  const profileRows = useMemo(() => ([
    { label: 'Name', value: getFullName(profile) },
    { label: 'Email', value: profile?.email || '-' },
    { label: 'Role', value: formatRole(profile?.role) },
    { label: 'Program', value: profile?.program || '-' },
    { label: 'Student ID', value: profile?.student_id || '-' },
    { label: 'Employee ID', value: profile?.employee_id || '-' },
    { label: 'Contact', value: profile?.contact_number || '-' },
  ]), [profile]);

  const quickContacts = useMemo(() => ([
    { label: 'Email', value: displayProfile.email || '-', icon: Mail },
    { label: 'Contact', value: displayProfile.contact_number || '-', icon: Phone },
  ]), [displayProfile.email, displayProfile.contact_number]);

  const userInitials = useMemo(() => {
    const first = displayProfile.first_name?.[0] || '';
    const last = displayProfile.last_name?.[0] || '';
    return `${first}${last}`.toUpperCase() || 'CO';
  }, [displayProfile.first_name, displayProfile.last_name]);

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
      <header className="account-settings-header">
        <div className="account-settings-identity">
          <div className="account-avatar">{userInitials}</div>
          <div>
            <span className="account-kicker">{roleLabel}</span>
            <h1>Settings</h1>
            <p>{displayName}</p>
          </div>
        </div>

        <div className="account-status-group" aria-label="Account status">
          <span className="account-status-pill">
            <ShieldCheck size={15} />
            Active
          </span>
        </div>
      </header>

      <div className="account-settings-shell">
        <nav className="account-settings-nav" aria-label="Account settings sections">
          {accountSections.map(section => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;

            return (
              <button
                key={section.id}
                type="button"
                className={`account-settings-nav-item${isActive ? ' is-active' : ''}`}
                onClick={() => setActiveSection(section.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="account-settings-nav-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span>{section.label}</span>
              </button>
            );
          })}
        </nav>

        <main className="account-settings-panel">
          {activeSection === 'profile' && (
            <section aria-labelledby="account-profile-heading">
              <div className="account-panel-head">
                <div>
                  <span className="account-section-count">01</span>
                  <h2 id="account-profile-heading">Profile</h2>
                </div>
              </div>

              {loadingProfile ? (
                <p className="account-muted-copy">Loading account details...</p>
              ) : (
                <>
                  <div className="account-contact-strip">
                    {quickContacts.map(item => {
                      const Icon = item.icon;

                      return (
                        <div key={item.label} className="account-contact-card">
                          <span aria-hidden="true">
                            <Icon size={16} />
                          </span>
                          <div>
                            <small>{item.label}</small>
                            <strong>{item.value}</strong>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="account-profile-grid">
                    {profileRows.map(item => (
                      <div key={item.label} className="account-profile-row">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {activeSection === 'security' && (
            <section aria-labelledby="account-security-heading">
              <div className="account-panel-head">
                <div>
                  <span className="account-section-count">02</span>
                  <h2 id="account-security-heading">Security</h2>
                </div>
              </div>

              <form className="account-settings-form" onSubmit={handlePasswordSubmit}>
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

                <div className="account-field-grid">
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
                    <label htmlFor="confirm-password">Confirm password</label>
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

                <div className="account-panel-footer">
                  <button type="submit" className="btn btn-primary">
                    <LockKeyhole size={16} />
                    {passwordBusy ? 'Saving...' : 'Save password'}
                  </button>
                </div>
              </form>
            </section>
          )}

          {activeSection === 'requests' && (
            <section aria-labelledby="account-requests-heading">
              <div className="account-panel-head">
                <div>
                  <span className="account-section-count">03</span>
                  <h2 id="account-requests-heading">Requests</h2>
                </div>
              </div>

              <form className="account-settings-form" onSubmit={handleRequestSubmit}>
                <div className="account-field-grid">
                  <div className="input-group">
                    <label htmlFor="request-type">Category</label>
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
                    <label htmlFor="requested-email">New email</label>
                    <input
                      id="requested-email"
                      type="email"
                      className="input-field"
                      value={requestForm.requested_email}
                      onChange={event => setRequestForm(prev => ({ ...prev, requested_email: event.target.value }))}
                      autoComplete="email"
                      placeholder="name@example.com"
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label htmlFor="requested-contact">New contact number</label>
                  <input
                    id="requested-contact"
                    type="tel"
                    className="input-field"
                    value={requestForm.requested_contact_number}
                    onChange={event => setRequestForm(prev => ({ ...prev, requested_contact_number: event.target.value }))}
                    autoComplete="tel"
                    placeholder="09xx xxx xxxx"
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="request-note">Note</label>
                  <textarea
                    id="request-note"
                    className="input-field account-textarea"
                    value={requestForm.note}
                    onChange={event => setRequestForm(prev => ({ ...prev, note: event.target.value }))}
                    placeholder="What should be corrected?"
                    minLength={10}
                    required
                  />
                </div>

                <div className="account-panel-footer">
                  <button type="submit" className="btn btn-primary">
                    <Send size={16} />
                    {requestBusy ? 'Sending...' : 'Send request'}
                  </button>
                </div>
              </form>
            </section>
          )}
        </main>
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
