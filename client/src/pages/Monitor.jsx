import { useState, useEffect } from 'react';
import api from '../api';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

export default function Monitor() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await api.get('/monitor/status');
      setStatus(res.data);
    } catch (err) {
      console.error('Failed to fetch monitor status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(fetchStatus, 10000); // Refresh every 10s
    return () => clearInterval(timer);
  }, [autoRefresh]);

  if (loading) return <div className="p-6">加载中...</div>;

  const isRunning = status?.running;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">BIND 服务监控</h2>
        <div className="flex items-center space-x-3">
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded text-primary-600"
            />
            <span>自动刷新（10秒）</span>
          </label>
          <button
            onClick={fetchStatus}
            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
          >
            刷新
          </button>
        </div>
      </div>

      {/* Status Overview */}
      <div className={`mb-6 p-6 rounded-lg border-2 ${isRunning ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
        <div className="flex items-center space-x-3">
          <span className={`text-4xl ${isRunning ? 'text-green-600' : 'text-red-600'}`}>
            {isRunning ? '●' : '○'}
          </span>
          <div>
            <h3 className={`text-xl font-bold ${isRunning ? 'text-green-800' : 'text-red-800'}`}>
              {isRunning ? 'BIND 运行中' : 'BIND 未运行'}
            </h3>
            {status?.pid && (
              <p className="text-sm text-gray-600">PID: {status.pid}</p>
            )}
            {status?.rndc?.version && (
              <p className="text-sm text-gray-600">版本: {status.rndc.version}</p>
            )}
          </div>
        </div>
      </div>

      {/* Detail Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Memory */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
          <h4 className="text-sm font-medium text-gray-500 mb-2">内存使用</h4>
          <p className="text-2xl font-bold text-blue-600">
            {status?.memory?.rss ? formatBytes(status.memory.rss) : '-'}
          </p>
          <p className="text-xs text-gray-400 mt-1">RSS 物理内存</p>
          {status?.memory?.vms && (
            <p className="text-xs text-gray-400">VMS: {formatBytes(status.memory.vms)}</p>
          )}
        </div>

        {/* CPU */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
          <h4 className="text-sm font-medium text-gray-500 mb-2">CPU 使用</h4>
          <p className="text-2xl font-bold text-purple-600">
            {status?.cpu?.percent !== undefined ? `${status.cpu.percent}%` : '-'}
          </p>
          <p className="text-xs text-gray-400 mt-1">进程 CPU 占用</p>
          {status?.cpu?.threads && (
            <p className="text-xs text-gray-400">线程数: {status.cpu.threads}</p>
          )}
        </div>

        {/* Ports */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
          <h4 className="text-sm font-medium text-gray-500 mb-2">端口监听</h4>
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className={`w-2 h-2 rounded-full ${status?.ports?.tcp ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="text-sm">TCP:53 {status?.ports?.tcp ? '监听中' : '未监听'}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`w-2 h-2 rounded-full ${status?.ports?.udp ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="text-sm">UDP:53 {status?.ports?.udp ? '监听中' : '未监听'}</span>
            </div>
          </div>
        </div>

        {/* Uptime */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
          <h4 className="text-sm font-medium text-gray-500 mb-2">运行时长</h4>
          <p className="text-lg font-bold text-green-600">
            {status?.rndc?.uptime || '-'}
          </p>
          {status?.startTime && (
            <p className="text-xs text-gray-400 mt-1">
              启动于: {new Date(status.startTime).toLocaleString('zh-CN')}
            </p>
          )}
        </div>
      </div>

      {/* rndc status output */}
      {status?.rndc?.output && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-3">rndc status 详细输出</h3>
          <pre className="bg-gray-50 dark:bg-gray-700 p-4 rounded text-sm font-mono overflow-x-auto whitespace-pre-wrap">
            {status.rndc.output}
          </pre>
        </div>
      )}

      {/* Last update */}
      <p className="text-xs text-gray-400 mt-4 text-right">
        最后更新: {status?.timestamp ? new Date(status.timestamp).toLocaleString('zh-CN') : '-'}
      </p>
    </div>
  );
}
