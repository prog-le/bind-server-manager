import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

const ACTION_LABELS = {
  create_zone: '创建 Zone',
  delete_zone: '删除 Zone',
  create_record: '创建记录',
  update_record: '更新记录',
  delete_record: '删除记录',
  reload_zone: '重载 Zone',
  restore_backup: '恢复备份',
  update_settings: '更新设置',
  login: '登录',
  register: '注册',
};

const STATUS_COLORS = {
  success: 'text-green-600',
  failed: 'text-red-600',
};

export default function Dashboard() {
  const [stats, setStats] = useState({ zones: 0, records: 0 });
  const [bindStatus, setBindStatus] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [zonesRes, statusRes, logsRes] = await Promise.all([
        api.get('/zones'),
        api.get('/settings/status').catch(() => ({ data: { running: false } })),
        api.get('/logs?pageSize=10').catch(() => ({ data: { logs: [] } })),
      ]);
      const zones = zonesRes.data.zones;
      let totalRecords = 0;
      for (const zone of zones) {
        try {
          const recRes = await api.get(`/zones/${zone.name}/records`);
          totalRecords += recRes.data.records.length;
        } catch {}
      }
      setStats({ zones: zones.length, records: totalRecords });
      setBindStatus(statusRes.data);
      setRecentLogs(logsRes.data.logs || []);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">仪表盘</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">BIND 状态</h3>
          <p className={`text-2xl font-bold mt-2 ${bindStatus?.running ? 'text-green-600' : 'text-red-600'}`}>
            {bindStatus?.running ? '运行中' : '已停止'}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Zone 总数</h3>
          <p className="text-2xl font-bold mt-2 text-primary-600">{stats.zones}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">记录总数</h3>
          <p className="text-2xl font-bold mt-2 text-primary-600">{stats.records}</p>
        </div>
      </div>

      {/* Recent Activity + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">最近活动</h2>
            <Link to="/logs" className="text-sm text-primary-600 hover:text-primary-800">查看全部</Link>
          </div>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-gray-500">暂无最近活动</p>
          ) : (
            <div className="space-y-3">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-start space-x-3 text-sm border-b border-gray-100 pb-2 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900">
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                      <span className={`text-xs ${STATUS_COLORS[log.status] || 'text-gray-500'}`}>
                        {log.status}
                      </span>
                    </div>
                    {log.target && (
                      <p className="text-gray-500 truncate">{log.target}{log.detail ? ` — ${log.detail}` : ''}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      {log.username || 'system'} · {log.ip || '—'} · {log.created_at}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">快捷操作</h2>
          <div className="flex flex-col space-y-3">
            <Link
              to="/zones"
              className="bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700 transition-colors text-center"
            >
              管理 Zone
            </Link>
            <Link
              to="/settings"
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors text-center"
            >
              系统设置
            </Link>
            <Link
              to="/logs"
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200 transition-colors text-center"
            >
              查看日志
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
