import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Menu, X, LogOut, Bell, ChevronDown, ChevronLeft, ChevronRight, Settings, CheckCheck, CheckCircle2, XCircle, FileText, Mail, Phone, UserRound } from 'lucide-react';
import ThemeToggleButton from '../theme/ThemeToggleButton';
import api from '../../services/api';
import './DashboardLayout.css';

const SIDEBAR_COLLAPSED_KEY = 'coedigo_sidebar_collapsed';

export default function DashboardLayout({ navItems }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [requestActionBusy, setRequestActionBusy] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelNote, setCancelNote] = useState('');
  const [toast, setToast] = useState(null);
  const profileRef = useRef(null);
  const notificationsRef = useRef(null);

  const handleLogout = () => { logout(); navigate('/login'); };
  const accountPath = user?.role === 'admin'
    ? '/admin/account'
    : user?.role === 'faculty'
      ? '/faculty/account'
      : user?.role === 'student'
        ? '/student/account'
        : '/dean/account';

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(e.target)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setProfileOpen(false);
    setNotificationsOpen(false);
    fetchUnreadCount();
  }, [location.pathname]);

  useEffect(() => {
    fetchUnreadCount();
    const intervalId = window.setInterval(fetchUnreadCount, 45000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  const showToast = (msg, type = 'success', duration = 4000) => {
    setToast({ msg, type });
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => setToast(null), duration);
  };

  const roleLabels = {
    admin: 'Administrator',
    faculty: 'Faculty / Instructor',
    student: 'Student',
    dean: 'Dean',
    program_chair: 'Program Chair'
  };

  // Get current page title from nav items
  const currentPage = navItems.find(item => {
    if (item.end) return location.pathname === item.path;
    return location.pathname.startsWith(item.path);
  });
  const pageTitle = location.pathname.endsWith('/account')
    ? 'Account Settings'
    : currentPage?.label || 'Dashboard';

  function fetchUnreadCount() {
    api.get('/notifications/unread-count')
      .then(response => setUnreadCount(response.data?.data?.count || 0))
      .catch(() => {});
  }

  function fetchNotifications() {
    setNotificationsLoading(true);
    api.get('/notifications?limit=8')
      .then(response => setNotifications(response.data?.data || []))
      .catch(() => {})
      .finally(() => setNotificationsLoading(false));
  }

  const toggleNotifications = () => {
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);
    if (nextOpen) {
      fetchNotifications();
      fetchUnreadCount();
    }
  };

  const handleOpenAccountSettings = () => {
    navigate(accountPath);
    setProfileOpen(false);
  };

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications(prev => prev.map(item => ({ ...item, is_read: 1 })));
      setUnreadCount(0);
    } catch {
      // Keep UI stable even if mark-all fails.
    }
  };

  const handleNotificationRead = async (notificationId) => {
    const target = notifications.find(item => item.id === notificationId);
    try {
      await api.put(`/notifications/${notificationId}/read`);
      setNotifications(prev => prev.map(item => item.id === notificationId ? { ...item, is_read: 1 } : item));
      if (target && !target.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch {
      // Ignore read failure to avoid breaking dropdown interactions.
    }
  };

  const openCancelModal = (item) => {
    setCancelTarget(item);
    setCancelNote('');
  };

  const closeCancelModal = () => {
    setCancelTarget(null);
    setCancelNote('');
  };

  const handleRequestStatusUpdate = async (item, status, adminNote = '') => {
    setRequestActionBusy(item.id);
    try {
      const response = await api.put(`/notifications/${item.id}/request-status`, {
        status,
        admin_note: adminNote,
      });
      showToast(response.data?.message || (status === 'done' ? 'Request marked done.' : 'Request cancelled.'));
      fetchNotifications();
      fetchUnreadCount();
      if (status === 'cancelled') {
        closeCancelModal();
      }
    } catch (error) {
      const fieldErrors = error.response?.data?.errors;
      const fieldMessage = fieldErrors ? Object.values(fieldErrors).join(' ') : '';
      showToast([error.response?.data?.message, fieldMessage].filter(Boolean).join(' ') || 'Unable to update request.', 'error', 6000);
    } finally {
      setRequestActionBusy(null);
    }
  };

  const submitCancellation = async (event) => {
    event.preventDefault();

    if (!cancelTarget) return;
    await handleRequestStatusUpdate(cancelTarget, 'cancelled', cancelNote);
  };

  const formatNotificationTime = (value) => {
    if (!value) return '';

    const parsed = new Date(value.replace(' ', 'T'));
    if (Number.isNaN(parsed.getTime())) return '';

    return parsed.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const requestStatusLabel = (status) => {
    if (status === 'done') return 'Done';
    if (status === 'cancelled') return 'Cancelled';
    return 'Pending';
  };

  const formatRoleLabel = (role) => role ? role.replace('_', ' ') : 'User';

  const renderRequestNotification = (item) => {
    const request = item.request;
    const isPending = request?.status === 'pending';
    const isBusy = requestActionBusy === item.id;

    return (
      <div key={item.id} className={`notification-item notification-request-card ${item.is_read ? '' : 'is-unread'}`}>
        <div className="notification-item-head">
          <div>
            <strong>{request?.requester?.name || item.title}</strong>
            <span className={`notification-status-pill status-${request?.status || 'pending'}`}>
              {requestStatusLabel(request?.status)}
            </span>
          </div>
          {!item.is_read && <span className="notification-unread-dot" aria-hidden="true" />}
        </div>

        <div className="notification-request-meta">
          <div><UserRound size={13} /><span>{formatRoleLabel(request?.requester?.role)}{request?.requester?.program ? ` | ${request.requester.program}` : ''}</span></div>
          <div><FileText size={13} /><span>{request?.request_type_label || 'Account update request'}</span></div>
          {request?.current_email && <div><Mail size={13} /><span>{request.current_email}</span></div>}
          {request?.requested_contact_number && <div><Phone size={13} /><span>{request.requested_contact_number}</span></div>}
        </div>

        {(request?.requested_email || request?.requested_contact_number) && (
          <div className="notification-request-targets">
            {request?.requested_email && <span>Requested email: <strong>{request.requested_email}</strong></span>}
            {request?.requested_contact_number && <span>Requested contact: <strong>{request.requested_contact_number}</strong></span>}
          </div>
        )}

        <p>{request?.note || item.message}</p>

        {request?.admin_note && (
          <div className="notification-request-note">
            <strong>{request.status === 'cancelled' ? 'Cancellation note' : 'Admin note'}</strong>
            <span>{request.admin_note}</span>
          </div>
        )}

        <small>
          {formatNotificationTime(item.created_at)}
          {request?.resolved_at ? ` | Resolved ${formatNotificationTime(request.resolved_at)}` : ''}
          {request?.resolved_by_name ? ` by ${request.resolved_by_name}` : ''}
        </small>

        {user?.role === 'admin' && isPending && (
          <div className="notification-request-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm notification-action-btn"
              onClick={() => handleRequestStatusUpdate(item, 'done')}
              disabled={isBusy}
            >
              <CheckCircle2 size={14} />
              {isBusy ? 'Saving...' : 'Done'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm notification-action-btn notification-action-cancel"
              onClick={() => openCancelModal(item)}
              disabled={isBusy}
            >
              <XCircle size={14} />
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`dashboard-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="brand-icon">
              <img src="/coedigo-brand-logo.png" alt="COEDIGO" />
            </div>
            <div>
              <span className="brand-name">C.O.E.D.I.G.O.</span>
              <span className="brand-sub">JRMSU – COE</span>
            </div>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
            <X size={20} />
          </button>
        </div>

        <button
          type="button"
          className="sidebar-collapse-toggle"
          onClick={() => setSidebarCollapsed(current => !current)}
          title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          <span>{sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}</span>
        </button>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
              end={item.end}
              title={item.label}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">
              {user?.first_name?.[0]}{user?.last_name?.[0]}
            </div>
            <div className="user-info">
              <span className="user-name">{user?.first_name} {user?.last_name}</span>
              <span className="user-role">{roleLabels[user?.role] || user?.role}</span>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu size={22} />
            </button>
            <h2 className="topbar-title">{pageTitle}</h2>
          </div>

          <div className="topbar-right">
            <ThemeToggleButton compact className="topbar-theme-toggle" />

            <div className="notification-dropdown" ref={notificationsRef}>
              <button className="topbar-btn notification-trigger" title="Notifications" onClick={toggleNotifications} aria-expanded={notificationsOpen}>
                <Bell size={20} />
                {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>

              {notificationsOpen && (
                <div className="dropdown-menu notification-menu">
                  <div className="notification-menu-head">
                    <div>
                      <strong>Notifications</strong>
                      <span>{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</span>
                    </div>
                    <button type="button" className="notification-mark-all" onClick={handleMarkAllRead}>
                      <CheckCheck size={14} />
                      <span>Mark all read</span>
                    </button>
                  </div>

                  <div className="dropdown-divider" />

                  <div className="notification-list">
                    {notificationsLoading ? (
                      <div className="notification-empty-state">Loading notifications...</div>
                    ) : notifications.length ? (
                      notifications.map(item => item.request && user?.role === 'admin'
                        ? renderRequestNotification(item)
                        : (
                          <button
                            type="button"
                            key={item.id}
                            className={`notification-item ${item.is_read ? '' : 'is-unread'}`}
                            onClick={() => handleNotificationRead(item.id)}
                          >
                            <div className="notification-item-head">
                              <strong>{item.title}</strong>
                              {!item.is_read && <span className="notification-unread-dot" aria-hidden="true" />}
                            </div>
                            <p>{item.message}</p>
                            <small>{formatNotificationTime(item.created_at)}</small>
                          </button>
                        ))
                    ) : (
                      <div className="notification-empty-state">No notifications yet.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="profile-dropdown" ref={profileRef}>
              <button
                className="topbar-profile"
                onClick={() => setProfileOpen(!profileOpen)}
                aria-expanded={profileOpen}
              >
                <div className="user-avatar sm">
                  {user?.first_name?.[0]}{user?.last_name?.[0]}
                </div>
                <span className="profile-name">{user?.first_name}</span>
                <ChevronDown size={14} className={`chevron ${profileOpen ? 'rotated' : ''}`} />
              </button>

              {profileOpen && (
                <div className="dropdown-menu">
                  <div className="dropdown-header">
                    <strong>{user?.first_name} {user?.last_name}</strong>
                    <span>{user?.email}</span>
                    <span className="dropdown-role">{roleLabels[user?.role]}</span>
                  </div>
                  <div className="dropdown-divider" />
                  <button className="dropdown-item dropdown-item-neutral" onClick={handleOpenAccountSettings}>
                    <Settings size={16} />
                    Account Settings
                  </button>
                  <button className="dropdown-item" onClick={handleLogout}>
                    <LogOut size={16} />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>

      <nav className="mobile-nav-dock" aria-label="Primary mobile navigation">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
            end={item.end}
            title={item.label}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {cancelTarget && (
        <div className="modal-overlay" onClick={closeCancelModal}>
          <div className="modal-content notification-cancel-modal" onClick={event => event.stopPropagation()}>
            <div className="flex-between" style={{ marginBottom:'1rem' }}>
              <h2>Cancel Request</h2>
              <button className="btn btn-ghost btn-sm" onClick={closeCancelModal}><X size={18} /></button>
            </div>

            <p style={{ color:'var(--text-secondary)', marginBottom:'1rem' }}>
              Add the reason for cancelling the request from <strong>{cancelTarget.request?.requester?.name || 'this user'}</strong>.
            </p>

            <form onSubmit={submitCancellation} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
              <div className="input-group">
                <label htmlFor="request-cancel-note">Cancellation description</label>
                <textarea
                  id="request-cancel-note"
                  className="input-field notification-cancel-textarea"
                  value={cancelNote}
                  onChange={event => setCancelNote(event.target.value)}
                  placeholder="Explain why the request is being cancelled and what the user should correct."
                  minLength={10}
                  required
                />
              </div>

              <div className="notification-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeCancelModal}>Back</button>
                <button type="submit" className="btn btn-primary" disabled={requestActionBusy === cancelTarget.id}>
                  <XCircle size={16} />
                  {requestActionBusy === cancelTarget.id ? 'Saving...' : 'Confirm cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
