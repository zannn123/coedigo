import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Menu, X, LogOut, Bell, ChevronDown } from 'lucide-react';
import './DashboardLayout.css';

export default function DashboardLayout({ navItems }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef(null);

  const handleLogout = () => { logout(); navigate('/login'); };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close dropdown on route change
  useEffect(() => { setProfileOpen(false); }, [location]);

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
  const pageTitle = currentPage?.label || 'Dashboard';

  return (
    <div className="dashboard-layout">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
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

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
              end={item.end}
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
            <button className="topbar-btn" title="Notifications">
              <Bell size={20} />
            </button>

            <div className="profile-dropdown" ref={dropdownRef}>
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
    </div>
  );
}
