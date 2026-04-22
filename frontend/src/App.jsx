import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import DashboardLayout from './components/layout/DashboardLayout';
import Login from './pages/auth/Login';
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import SystemSettings from './pages/admin/SystemSettings';
import AuditLogs from './pages/admin/AuditLogs';
import FacultyDashboard from './pages/faculty/FacultyDashboard';
import ClassManagement from './pages/faculty/ClassManagement';
import SubjectManagement from './pages/faculty/SubjectManagement';
import GradeBook from './pages/faculty/GradeBook';
import StudentDashboard from './pages/student/StudentDashboard';
import DeanDashboard from './pages/dean/DeanDashboard';
import { LayoutDashboard, Users, Settings, ScrollText, BookOpen, ClipboardList, GraduationCap, BarChart3, FileText } from 'lucide-react';

function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />;
  return children;
}

const adminNav = [
  { path: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={18} />, end: true },
  { path: '/admin/users', label: 'User Management', icon: <Users size={18} /> },
  { path: '/admin/settings', label: 'System Settings', icon: <Settings size={18} /> },
  { path: '/admin/audit-logs', label: 'Activity Logs', icon: <ScrollText size={18} /> },
];

const facultyNav = [
  { path: '/faculty', label: 'Dashboard', icon: <LayoutDashboard size={18} />, end: true },
  { path: '/faculty/classes', label: 'Class Records', icon: <ClipboardList size={18} /> },
  { path: '/faculty/subjects', label: 'Subjects', icon: <BookOpen size={18} /> },
];

const studentNav = [
  { path: '/student', label: 'Dashboard & Grades', icon: <GraduationCap size={18} />, end: true },
];

const deanNav = [
  { path: '/dean', label: 'Monitoring', icon: <BarChart3 size={18} />, end: true },
];

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'admin' ? '/admin' : user.role === 'faculty' ? '/faculty' : user.role === 'student' ? '/student' : '/dean'} replace /> : <Login />} />

      <Route path="/admin" element={<ProtectedRoute roles={['admin']}><DashboardLayout navItems={adminNav} /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="settings" element={<SystemSettings />} />
        <Route path="audit-logs" element={<AuditLogs />} />
      </Route>

      <Route path="/faculty" element={<ProtectedRoute roles={['faculty']}><DashboardLayout navItems={facultyNav} /></ProtectedRoute>}>
        <Route index element={<FacultyDashboard />} />
        <Route path="classes" element={<ClassManagement />} />
        <Route path="classes/:classId" element={<GradeBook />} />
        <Route path="subjects" element={<SubjectManagement />} />
      </Route>

      <Route path="/student" element={<ProtectedRoute roles={['student']}><DashboardLayout navItems={studentNav} /></ProtectedRoute>}>
        <Route index element={<StudentDashboard />} />
      </Route>

      <Route path="/dean" element={<ProtectedRoute roles={['dean','program_chair']}><DashboardLayout navItems={deanNav} /></ProtectedRoute>}>
        <Route index element={<DeanDashboard />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
