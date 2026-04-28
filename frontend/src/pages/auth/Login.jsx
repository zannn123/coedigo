import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { LogIn, Eye, EyeOff } from 'lucide-react';
import './Login.css';

const PH_TIME_ZONE = 'Asia/Manila';

function getPhilippineHour() {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: PH_TIME_ZONE,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(new Date()));
}

function getLoginThemeForPhilippineTime() {
  const hour = getPhilippineHour();
  return hour >= 18 || hour < 6 ? 'dark' : 'light';
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const previousThemeRef = useRef(theme);

  const roleRoutes = {
    admin: '/admin',
    faculty: '/faculty',
    student: '/student',
    dean: '/dean',
    program_chair: '/program-chair'
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(roleRoutes[user.role] || '/');
    } catch (err) {
      setError(err.response?.data?.message || err.userMessage || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.body.classList.add('login-theme-lock');

    const applyPhilippineTimeTheme = () => {
      setTheme(getLoginThemeForPhilippineTime());
    };

    applyPhilippineTimeTheme();
    const intervalId = window.setInterval(applyPhilippineTimeTheme, 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
      document.body.classList.remove('login-theme-lock');
      setTheme(previousThemeRef.current);
    };
  }, [setTheme]);

  return (
    <div className="login-page">
      <main className="login-shell animate-in">
        <section className="login-visual" aria-label="COEDIGO overview">
          <div className="login-visual-brand">
            <img src="/coedigo-brand-logo.png" alt="" />
            <span>C.O.E.D.I.G.O.</span>
          </div>
          <div className="login-visual-copy">
            <span>JRMSU College of Engineering</span>
            <h2>Access your academic hub for grades, attendance, and class records.</h2>
          </div>
        </section>

        <section className="login-panel" aria-labelledby="login-title">
          <div className="login-mark" aria-hidden="true" />
          <div className="login-header">
            <h1 id="login-title">Log in to COEDIGO</h1>
            <p className="login-subtitle">College of Engineering Digital Interface for Grade Observations.</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {error && <div className="login-error">{error}</div>}

            <div className="input-group">
              <label htmlFor="login-email">Email address</label>
              <input id="login-email" type="email" className="input-field" placeholder="you@jrmsu.edu.ph" value={email} onChange={e => setEmail(e.target.value)} required autoFocus autoComplete="email" />
            </div>

            <div className="input-group">
              <label htmlFor="login-password">Password</label>
              <div className="password-wrapper">
                <input id="login-password" type={showPw ? 'text' : 'password'} className="input-field" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
                <button type="button" className="password-toggle" onClick={() => setShowPw(!showPw)} aria-label="Toggle password visibility">
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
              {loading ? <span className="spinner" /> : <LogIn size={18} />}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="login-footer">
            <p className="login-footer-info">Protected academic access for JRMSU College of Engineering.</p>
            <Link to="/request-account" className="login-footer-cta">Request for Account</Link>
            <Link to="/developers" className="login-footer-credit">Developed by COEDIGO TEAM</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
