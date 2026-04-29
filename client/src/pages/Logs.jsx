import { useState, useEffect } from 'react';
import api from '../api';

const ACTION_OPTIONS = [
  { value: '', label: '全部操作' },
  { value: 'create_zone', label: '创建 Zone' },
  { value: 'delete_zone', label: '删除 Zone' },
  { value: 'reload_zone', label: '重载 Zone' },
  { value: 'create_record', label: '创建记录' },
  { value: 'update_record', label: '更新记录' },
  { value: 'delete_record', label: '删除记录' },
  { value: 'update_settings', label: '更新设置' },
  { value: 'login', label: '登录' },
  { value: 'register', label: '注册' },
];

const ACTION_COLORS = {
  create_zone: 'bg-green-100 text-green-800',
  delete_zone: 'bg-red-100 text-red-800',
  reload_zone: 'bg-blue-100 text-blue-800',
  create_record: 'bg-emerald-100 text-emerald-800',
  update_record: 'bg-yellow-100 text-yellow-800',
  delete_record: 'bg-orange-100 text-orange-800',
  update_settings: 'bg-purple-100 text-purple-800',
  login: 'bg-cyan-100 text-cyan-800',
  register: 'bg-teal-100 text-teal-800',
};

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ action: '', username: '', keyword: '', status: '' });

  useEffect(() => {
    loadLogs();
  }, [page]);

  async function loadLogs() {
    setLoading(true);
    try {
      const params = { page, pageSize: 50 };
      if (filters.action) params.action = filters.action;
      if (filters.username) params.username = filters.username;
      if (filters.keyword) params.keyword = filters.keyword;
      if (filters.status) params.status = filters.status;
      const res = await api.get('/logs', { params });
      setLogs(res.data.logs);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e) {
    e.preventDefault();
    setPage(1);
    loadLogs();
  }

  function handleReset() {
    setFilters({ action: '', username: '', keyword: '', status: '' });
    setPage(1);
    setTimeout(() => loadLogs(), 0);
  }

  function formatTime(str) {
    if (!str) return '-';
    return str.replace('T', ' ').replace(/\.\d+Z$/, '');
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">操作日志</h1>

      {/* Filters */}
      <form onSubmit={handleSearch} className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <select
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            {ACTION_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={filters.username}
            onChange={(e) => setFilters({ ...filters, username: e.target.value })}
            placeholder="用户名"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <input
            type="text"
            value={filters.keyword}
            onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
            placeholder="搜索目标/详情"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="">全部状态</option>
            <option value="success">成功</option>
            <option value="failed">失败</option>
          </select>
          <div className="flex space-x-2">
            <button type="submit" className="bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700 transition-colors text-sm">
              搜索
            </button>
            <button type="button" onClick={handleReset} className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition-colors text-sm">
              重置
            </button>
          </div>
        </div>
      </form>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">时间</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">用户</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">目标</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">详情</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan="7" className="px-6 py-8 text-center text-gray-500">加载中...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan="7" className="px-6 py-8 text-center text-gray-500">暂无日志记录</td></tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{formatTime(log.created_at)}</td>
                  <td className="px-6 py-4 text-sm font-medium">{log.username || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-block text-xs px-2 py-1 rounded ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-800'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-mono">{log.target || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={log.detail || ''}>{log.detail || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{log.ip || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-block text-xs px-2 py-1 rounded ${log.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            共 {pagination.total} 条记录，第 {pagination.page}/{pagination.totalPages} 页
          </p>
          <div className="flex space-x-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50"
            >
              上一页
            </button>
            <button
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
