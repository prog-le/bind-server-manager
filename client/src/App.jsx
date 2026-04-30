import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ZoneList from './pages/ZoneList';
import ZoneDetail from './pages/ZoneDetail';
import Settings from './pages/Settings';
import Logs from './pages/Logs';
import Users from './pages/Users';
import Audit from './pages/Audit';
import Monitor from './pages/Monitor';
import DnsLogs from './pages/DnsLogs';
import Alerts from './pages/Alerts';
import Performance from './pages/Performance';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">加载中...</div>;
  return user ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="zones" element={<ZoneList />} />
        <Route path="zones/:name" element={<ZoneDetail />} />
        <Route path="settings" element={<Settings />} />
        <Route path="logs" element={<Logs />} />
        <Route path="audit" element={<Audit />} />
        <Route path="monitor" element={<Monitor />} />
        <Route path="dns-logs" element={<DnsLogs />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="performance" element={<Performance />} />
        <Route path="users" element={<Users />} />
      </Route>
    </Routes>
  );
}
