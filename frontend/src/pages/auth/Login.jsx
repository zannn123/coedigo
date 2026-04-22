import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LogIn, Eye, EyeOff, GraduationCap } from 'lucide-react';
import './Login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const roleRoutes = {
    admin: '/admin',
    faculty: '/faculty',
    student: '/student',
    dean: '/dean',
    program_chair: '/dean'
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(roleRoutes[user.role] || '/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg-pattern" />
      <div className="login-container animate-in">
        <div className="login-header">
          <div className="login-logo">
            <GraduationCap size={40} strokeWidth={1.5} />
          </div>
          <h1>C.O.E.D.I.G.O.</h1>
          <p className="login-subtitle">College of Engineering Digital Interface<br/>for Grading and Operations</p>
          <p className="login-institution">Jose Rizal Memorial State University</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}

          <div className="input-group">
            <label htmlFor="login-email">Email Address</label>
            <input id="login-email" type="email" className="input-field" placeholder="you@jrmsu.edu.ph" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </div>

          <div className="input-group">
            <label htmlFor="login-password">Password</label>
            <div className="password-wrapper">
              <input id="login-password" type={showPw ? 'text' : 'password'} className="input-field" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required />
              <button type="button" className="password-toggle" onClick={() => setShowPw(!showPw)} aria-label="Toggle password">
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
            {loading ? <span className="spinner" /> : <LogIn size={18} />}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <p>&copy; 2025 JRMSU College of Engineering. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
