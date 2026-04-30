import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Role-based navigation:
// super_admin: everything except audit logs
// ops_admin: everything except audit logs and user management
// readonly (auditor): only audit logs
const allNavItems = [
  { path: '/', label: '仪表盘', icon: '📊', roles: ['super_admin', 'ops_admin'] },
  { path: '/monitor', label: '服务监控', icon: '📡', roles: ['super_admin', 'ops_admin'] },
  { path: '/zones', label: 'Zone 管理', icon: '🌐', roles: ['super_admin', 'ops_admin'] },
  { path: '/dns-logs', label: '解析日志', icon: '📝', roles: ['super_admin', 'ops_admin'] },
  { path: '/performance', label: '性能看板', icon: '📈', roles: ['super_admin', 'ops_admin'] },
  { path: '/settings', label: '系统设置', icon: '⚙️', roles: ['super_admin', 'ops_admin'] },
  { path: '/logs', label: '操作日志', icon: '📋', roles: ['super_admin', 'ops_admin'] },
  { path: '/alerts', label: '告警管理', icon: '🔔', roles: ['super_admin', 'ops_admin'] },
  { path: '/audit', label: '审计日志', icon: '🔒', roles: ['readonly'] },
  { path: '/users', label: '用户管理', icon: '👥', roles: ['super_admin'] },
];

export default function Sidebar() {
  const location = useLocation();
  const { user } = useAuth();

  const navItems = allNavItems.filter(item =>
    user?.role && item.roles.includes(user.role)
  );

  return (
    <aside className="w-64 bg-gray-900 text-white h-screen sticky top-0 flex flex-col flex-shrink-0">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold">BIND SERVER MANAGER</h1>
      </div>
      <nav className="mt-4 flex-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center px-4 py-3 text-sm transition-colors ${
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="mr-3">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-700 p-4 space-y-2 text-xs text-gray-400">
        <div className="font-medium text-gray-300">BIND SERVER MANAGER</div>
        <div>v1.0.0</div>
        <div>作者：prog-le</div>
        <a
          href="https://github.com/prog-le/bind-server-manager"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-400 hover:text-primary-300 break-all transition-colors"
        >
          GitHub
        </a>
        <div>Licensed under Apache 2.0</div>
      </div>
    </aside>
  );
}
