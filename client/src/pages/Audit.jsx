import { useState, useEffect } from 'react';
import api from '../api';

const ACTION_LABELS = {
  create_zones: '创建 Zone',
  delete_zones: '删除 Zone',
  create_records: '创建记录',
  update_records: '更新记录',
  delete_records: '删除记录',
  create_batch: '批量创建',
  update_batch: '批量更新',
  delete_batch: '批量删除',
  create_subdomains: '批量创建子域名',
  import_records: '导入记录',
  update_settings: '更新设置',
  restore_backups: '恢复备份',
  create_users: '创建用户',
  update_auth: '更新认证',
  delete_users: '删除用户',
};

export default function Audit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ action: '', username: '', keyword: '', from: '', to: '' });
  const [chainStatus, setChainStatus] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, pageSize: 50 };
      if (filters.action) params.action = filters.action;
      if (filters.username) params.username = filters.username;
      if (filters.keyword) params.keyword = filters.keyword;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;

      const res = await api.get('/audit', { params });
      setLogs(res.data.logs);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleFilter = (e) => {
    e.preventDefault();
    fetchLogs(1);
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await api.get('/audit/verify');
      setChainStatus(res.data);
    } catch (err) {
      setChainStatus({ valid: false, reason: '验证请求失败' });
    } finally {
      setVerifying(false);
    }
  };

  const handleExport = async (format) => {
    try {
      const params = {};
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      params.format = format;

      const res = await api.get('/audit/export', { params, responseType: format === 'csv' ? 'blob' : 'json' });

      if (format === 'csv') {
        const url = URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      alert('导出失败');
    }
  };

  const getActionLabel = (action) => {
    return ACTION_LABELS[action] || action;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">审计日志</h2>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {verifying ? '验证中...' : '验证完整性'}
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
          >
            导出 CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            导出 JSON
          </button>
        </div>
      </div>

      {/* Chain Integrity Status */}
      {chainStatus && (
        <div className={`mb-4 p-4 rounded-lg ${chainStatus.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex items-center space-x-2">
            <span className={`text-xl ${chainStatus.valid ? 'text-green-600' : 'text-red-600'}`}>
              {chainStatus.valid ? '🔒' : '⚠️'}
            </span>
            <span className={`font-semibold ${chainStatus.valid ? 'text-green-800' : 'text-red-800'}`}>
              {chainStatus.valid ? '审计日志链完整性验证通过' : '审计日志链完整性验证失败'}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            共 {chainStatus.total} 条审计记录
            {chainStatus.brokenAt && `，从记录 #${chainStatus.brokenAt} 开始链断裂`}
            {chainStatus.reason && `（${chainStatus.reason}）`}
          </p>
        </div>
      )}

      {/* Filters */}
      <form onSubmit={handleFilter} className="mb-4 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input
            type="text"
            placeholder="操作类型"
            value={filters.action}
            onChange={e => setFilters({ ...filters, action: e.target.value })}
            className="border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
          />
          <input
            type="text"
            placeholder="用户名"
            value={filters.username}
            onChange={e => setFilters({ ...filters, username: e.target.value })}
            className="border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
          />
          <input
            type="text"
            placeholder="关键词搜索"
            value={filters.keyword}
            onChange={e => setFilters({ ...filters, keyword: e.target.value })}
            className="border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
          />
          <input
            type="datetime-local"
            value={filters.from}
            onChange={e => setFilters({ ...filters, from: e.target.value })}
            className="border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
          />
          <input
            type="datetime-local"
            value={filters.to}
            onChange={e => setFilters({ ...filters, to: e.target.value })}
            className="border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
          />
        </div>
        <button
          type="submit"
          className="mt-3 px-4 py-2 bg-primary-600 text-white rounded text-sm hover:bg-primary-700"
        >
          筛选
        </button>
      </form>

      {/* Audit Log Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">加载中...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">时间</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">用户</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">操作</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">目标</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">详情</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">IP</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-4 py-8 text-center text-gray-500">暂无审计记录</td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{log.created_at}</td>
                        <td className="px-4 py-3 text-sm font-medium">{log.username}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                            {getActionLabel(log.action)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono">{log.target}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate" title={log.detail}>
                          {log.detail}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-500">{log.ip}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-block text-xs px-2 py-1 rounded ${log.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {log.status === 'success' ? '成功' : '失败'}
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
              <div className="px-4 py-3 border-t dark:border-gray-700 flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  共 {pagination.total} 条记录，第 {pagination.page}/{pagination.totalPages} 页
                </span>
                <div className="flex space-x-2">
                  <button
                    onClick={() => fetchLogs(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="px-3 py-1 border rounded disabled:opacity-50 dark:border-gray-600"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => fetchLogs(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="px-3 py-1 border rounded disabled:opacity-50 dark:border-gray-600"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
