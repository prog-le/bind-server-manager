import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [lockInfo, setLockInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasUsers, setHasUsers] = useState(true);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/auth/check').then(res => {
      setHasUsers(res.data.hasUsers);
    });
  }, []);

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockInfo?.locked || !lockInfo?.remainingSeconds) return;
    const timer = setInterval(() => {
      setLockInfo(prev => {
        if (!prev || prev.remainingSeconds <= 1) {
          clearInterval(timer);
          return null;
        }
        return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockInfo?.locked]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLockInfo(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      const data = err.response?.data;
      setError(data?.error || '登录失败');
      if (data?.locked) {
        setLockInfo({ locked: true, remainingSeconds: data.remainingSeconds || 900 });
      }
    } finally {
      setLoading(false);
    }
  };

  if (!hasUsers) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">欢迎使用 BIND SERVER MANAGER</h2>
          <p className="text-gray-600 mb-6">未找到管理员账户，请注册以开始使用。</p>
          <Link
            to="/register"
            className="inline-block bg-primary-600 text-white px-6 py-2 rounded hover:bg-primary-700 transition-colors"
          >
            创建管理员账户
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h2 className="text-2xl font-bold text-center mb-6">登录</h2>
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{error}</div>
        )}
        {lockInfo?.locked && (
          <div className="bg-yellow-50 text-yellow-800 p-3 rounded mb-4 text-sm">
            <p className="font-medium">账号已锁定</p>
            <p>
              剩余时间：
              {Math.floor(lockInfo.remainingSeconds / 60)}分{lockInfo.remainingSeconds % 60}秒
            </p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
              disabled={lockInfo?.locked}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
              disabled={lockInfo?.locked}
            />
          </div>
          <button
            type="submit"
            disabled={loading || lockInfo?.locked}
            className="w-full bg-primary-600 text-white py-2 rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {loading ? '登录中...' : lockInfo?.locked ? '账号已锁定' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
