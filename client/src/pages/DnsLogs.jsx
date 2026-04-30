import { useState, useEffect } from 'react';
import api from '../api';

export default function DnsLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 100, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ name: '', client_ip: '', type: '', from: '', to: '' });
  const [stats, setStats] = useState(null);
  const [showStats, setShowStats] = useState(false);

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, pageSize: 100 };
      if (filters.name) params.name = filters.name;
      if (filters.client_ip) params.client_ip = filters.client_ip;
      if (filters.type) params.type = filters.type;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;

      const res = await api.get('/dns-logs', { params });
      setLogs(res.data.logs);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error('Failed to load DNS logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await api.get('/dns-logs/stats?hours=24');
      setStats(res.data);
    } catch (err) {
      console.error('Failed to load DNS stats:', err);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleFilter = (e) => {
    e.preventDefault();
    fetchLogs(1);
  };

  const handleExport = async () => {
    try {
      const params = {};
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      const res = await api.get('/dns-logs/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dns_query_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('导出失败');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">DNS 解析日志</h2>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => { setShowStats(!showStats); if (!stats) fetchStats(); }}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {showStats ? '隐藏统计' : '查看统计'}
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
          >
            导出 CSV
          </button>
        </div>
      </div>

      {/* Stats Panel */}
      {showStats && stats && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h4 className="text-sm font-medium text-gray-500 mb-2">查询总量（24小时）</h4>
            <p className="text-3xl font-bold text-primary-600">{stats.total.toLocaleString()}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h4 className="text-sm font-medium text-gray-500 mb-2">查询类型分布</h4>
            <div className="space-y-1">
              {stats.typeDistribution?.slice(0, 5).map(t => (
                <div key={t.query_type} className="flex justify-between text-sm">
                  <span className="font-mono">{t.query_type}</span>
                  <span className="text-gray-500">{t.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h4 className="text-sm font-medium text-gray-500 mb-2">Top 域名</h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {stats.topDomains?.slice(0, 8).map(d => (
                <div key={d.query_name} className="flex justify-between text-sm">
                  <span className="font-mono truncate mr-2">{d.query_name}</span>
                  <span className="text-gray-500 flex-shrink-0">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h4 className="text-sm font-medium text-gray-500 mb-2">Top 客户端</h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {stats.topClients?.slice(0, 8).map(c => (
                <div key={c.client_ip} className="flex justify-between text-sm">
                  <span className="font-mono">{c.client_ip}</span>
                  <span className="text-gray-500">{c.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h4 className="text-sm font-medium text-gray-500 mb-2">响应码分布</h4>
            <div className="space-y-1">
              {stats.responseCodes?.map(r => (
                <div key={r.response_code} className="flex justify-between text-sm">
                  <span className={`font-mono ${r.response_code !== 'NOERROR' ? 'text-red-600' : ''}`}>{r.response_code || 'N/A'}</span>
                  <span className="text-gray-500">{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <form onSubmit={handleFilter} className="mb-4 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input
            type="text"
            placeholder="域名"
            value={filters.name}
            onChange={e => setFilters({ ...filters, name: e.target.value })}
            className="border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
          />
          <input
            type="text"
            placeholder="客户端 IP"
            value={filters.client_ip}
            onChange={e => setFilters({ ...filters, client_ip: e.target.value })}
            className="border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
          />
          <select
            value={filters.type}
            onChange={e => setFilters({ ...filters, type: e.target.value })}
            className="border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
          >
            <option value="">全部类型</option>
            <option value="A">A</option>
            <option value="AAAA">AAAA</option>
            <option value="CNAME">CNAME</option>
            <option value="MX">MX</option>
            <option value="NS">NS</option>
            <option value="TXT">TXT</option>
            <option value="SRV">SRV</option>
            <option value="PTR">PTR</option>
          </select>
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

      {/* Log Table */}
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">客户端 IP</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">查询域名</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">类型</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">响应码</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">响应数据</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-4 py-8 text-center text-gray-500">暂无 DNS 查询日志</td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{log.created_at}</td>
                        <td className="px-4 py-3 text-sm font-mono">{log.client_ip}</td>
                        <td className="px-4 py-3 text-sm font-mono">{log.query_name}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                            {log.query_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-block text-xs px-2 py-1 rounded ${log.response_code === 'NOERROR' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {log.response_code || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-500 max-w-xs truncate">{log.response_data}</td>
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
