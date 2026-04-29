import { Link, useLocation } from 'react-router-dom';

const navItems = [
  { path: '/', label: '仪表盘', icon: '📊' },
  { path: '/zones', label: 'Zone 管理', icon: '🌐' },
  { path: '/settings', label: '系统设置', icon: '⚙️' },
  { path: '/logs', label: '操作日志', icon: '📋' },
];

export default function Sidebar() {
  const location = useLocation();

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
