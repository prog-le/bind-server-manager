import { useState, useEffect } from 'react';
import api from '../api';
import ConfigValidator from '../components/ConfigValidator';

export default function Settings() {
  const [settings, setSettings] = useState({
    bind_config_path: '',
    bind_zone_dir: '',
    rndc_path: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [bindStatus, setBindStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('paths');

  // Backup state
  const [fullBackups, setFullBackups] = useState([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');
  const [schedule, setSchedule] = useState({ enabled: false, cron: '0 2 * * *', retain: 7 });

  useEffect(() => {
    loadSettings();
    checkStatus();
    loadBackups();
    loadSchedule();
  }, []);

  async function loadBackups() {
    try {
      const res = await api.get('/backups/full');
      setFullBackups(res.data.backups || []);
    } catch {}
  }

  async function loadSchedule() {
    try {
      const res = await api.get('/backups/schedule');
      if (res.data.config) setSchedule(res.data.config);
    } catch {}
  }

  async function handleFullBackup() {
    setBackupLoading(true);
    setBackupMsg('');
    try {
      const res = await api.post('/backups/full');
      setBackupMsg(`全量备份已创建：${res.data.backup.name} (${(res.data.backup.size / 1024 / 1024).toFixed(2)} MB)`);
      loadBackups();
    } catch (err) {
      setBackupMsg('备份失败：' + (err.response?.data?.error || err.message));
    } finally {
      setBackupLoading(false);
    }
  }

  async function handleSaveSchedule() {
    setBackupMsg('');
    try {
      await api.put('/backups/schedule', schedule);
      setBackupMsg('备份计划已保存');
    } catch (err) {
      setBackupMsg('保存失败：' + (err.response?.data?.error || err.message));
    }
  }

  async function handleDeleteBackup(name) {
    if (!confirm(`确定删除备份 ${name}？`)) return;
    try {
      await api.delete(`/backups/full/${encodeURIComponent(name)}`);
      loadBackups();
    } catch {}
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  async function loadSettings() {
    try {
      const res = await api.get('/settings');
      setSettings(res.data.settings);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function checkStatus() {
    try {
      const res = await api.get('/settings/status');
      setBindStatus(res.data);
    } catch {
      setBindStatus({ running: false, error: '无法检查状态' });
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.put('/settings', settings);
      setMessage('设置保存成功');
    } catch (err) {
      setMessage('保存设置失败：' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  }

  async function handleDetect() {
    setDetecting(true);
    setMessage('');
    try {
      const res = await api.get('/settings/detect');
      const detected = res.data.detected;
      setSettings({
        bind_config_path: detected.configPath || settings.bind_config_path,
        bind_zone_dir: detected.zoneDir || settings.bind_zone_dir,
        rndc_path: detected.rndcPath || settings.rndc_path,
      });
      setMessage('路径已自动检测，请检查后保存。');
    } catch (err) {
      setMessage('自动检测失败：' + (err.response?.data?.error || err.message));
    } finally {
      setDetecting(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">系统设置</h1>

      {/* Tabs */}
      <div className="flex space-x-4 mb-6 border-b">
        <button onClick={() => setActiveTab('paths')} className={`pb-2 px-1 text-sm font-medium ${activeTab === 'paths' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500'}`}>BIND 配置</button>
        <button onClick={() => setActiveTab('backups')} className={`pb-2 px-1 text-sm font-medium ${activeTab === 'backups' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500'}`}>备份管理</button>
        <button onClick={() => setActiveTab('validator')} className={`pb-2 px-1 text-sm font-medium ${activeTab === 'validator' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500'}`}>配置校验</button>
      </div>

      {/* === BIND Config Tab === */}
      {activeTab === 'paths' && (
        <>
          {/* BIND Status */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">BIND 状态</h2>
            <div className="flex items-center space-x-4">
              <span className={`inline-block w-3 h-3 rounded-full ${bindStatus?.running ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className={bindStatus?.running ? 'text-green-700' : 'text-red-700'}>
                {bindStatus?.running ? 'BIND 运行中' : 'BIND 未运行'}
              </span>
              <button onClick={checkStatus} className="text-sm text-primary-600 hover:text-primary-800 ml-4">刷新</button>
            </div>
            {bindStatus?.output && (
              <pre className="mt-3 bg-gray-50 dark:bg-gray-700 p-3 rounded text-sm text-gray-600 dark:text-gray-300 overflow-x-auto">{bindStatus.output}</pre>
            )}
            {bindStatus?.error && (
              <pre className="mt-3 bg-red-50 dark:bg-red-900/20 p-3 rounded text-sm text-red-600 overflow-x-auto">{bindStatus.error}</pre>
            )}
          </div>

          {/* BIND Paths */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">BIND 配置路径</h2>
            {message && (
              <div className={`p-3 rounded mb-4 text-sm ${message.includes('失败') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                {message}
              </div>
            )}
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">named.conf 路径</label>
                <input type="text" value={settings.bind_config_path} onChange={(e) => setSettings({ ...settings, bind_config_path: e.target.value })} placeholder="/etc/named.conf" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm dark:bg-gray-700" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Zone 文件目录</label>
                <input type="text" value={settings.bind_zone_dir} onChange={(e) => setSettings({ ...settings, bind_zone_dir: e.target.value })} placeholder="/var/named/" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm dark:bg-gray-700" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">rndc 路径</label>
                <input type="text" value={settings.rndc_path} onChange={(e) => setSettings({ ...settings, rndc_path: e.target.value })} placeholder="/usr/sbin/rndc" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm dark:bg-gray-700" />
              </div>
              <div className="flex space-x-3">
                <button type="submit" disabled={saving} className="bg-primary-600 text-white px-6 py-2 rounded hover:bg-primary-700 transition-colors disabled:opacity-50">
                  {saving ? '保存中...' : '保存设置'}
                </button>
                <button type="button" onClick={handleDetect} disabled={detecting} className="bg-gray-600 text-white px-6 py-2 rounded hover:bg-gray-700 transition-colors disabled:opacity-50">
                  {detecting ? '检测中...' : '自动检测路径'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* === Backup Management Tab === */}
      {activeTab === 'backups' && (
        <div className="space-y-6">
          {backupMsg && (
            <div className={`p-3 rounded text-sm ${backupMsg.includes('失败') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
              {backupMsg}
            </div>
          )}

          {/* Manual Full Backup */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">手动全量备份</h2>
            <p className="text-sm text-gray-500 mb-4">打包所有 Zone 文件 + named.conf + 数据库为 tar.gz 归档</p>
            <button onClick={handleFullBackup} disabled={backupLoading} className="bg-primary-600 text-white px-6 py-2 rounded hover:bg-primary-700 transition-colors disabled:opacity-50">
              {backupLoading ? '备份中...' : '立即全量备份'}
            </button>
          </div>

          {/* Scheduled Backup Config */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">定时备份计划</h2>
            <div className="space-y-4">
              <label className="flex items-center space-x-3">
                <input type="checkbox" checked={schedule.enabled} onChange={e => setSchedule({ ...schedule, enabled: e.target.checked })} className="rounded" />
                <span className="text-sm font-medium">启用定时备份</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cron 表达式</label>
                  <input type="text" value={schedule.cron} onChange={e => setSchedule({ ...schedule, cron: e.target.value })} placeholder="0 2 * * *" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md font-mono text-sm dark:bg-gray-700" />
                  <p className="text-xs text-gray-400 mt-1">默认每天凌晨 2:00（格式：分 时 日 月 周）</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">保留份数</label>
                  <input type="number" value={schedule.retain} onChange={e => setSchedule({ ...schedule, retain: parseInt(e.target.value) || 7 })} min={1} max={30} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-700" />
                  <p className="text-xs text-gray-400 mt-1">超出数量的旧备份将自动清理（1-30）</p>
                </div>
              </div>
              <button onClick={handleSaveSchedule} className="bg-primary-600 text-white px-6 py-2 rounded hover:bg-primary-700 transition-colors text-sm">保存计划</button>
            </div>
          </div>

          {/* Backup History */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold">备份历史</h2>
              <button onClick={loadBackups} className="text-sm text-primary-600 hover:text-primary-800">刷新</button>
            </div>
            {fullBackups.length === 0 ? (
              <p className="p-6 text-center text-gray-500">暂无全量备份</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">文件名</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">大小</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">创建时间</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {fullBackups.map(b => (
                    <tr key={b.name} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 text-sm font-mono">{b.name}</td>
                      <td className="px-4 py-3 text-sm">{formatSize(b.size)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{new Date(b.created_at).toLocaleString('zh-CN')}</td>
                      <td className="px-4 py-3 text-sm text-right space-x-3">
                        <a href={`/api/backups/full/${encodeURIComponent(b.name)}/download`} className="text-primary-600 hover:text-primary-800">下载</a>
                        <button onClick={() => handleDeleteBackup(b.name)} className="text-red-600 hover:text-red-800">删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* === Config Validator Tab === */}
      {activeTab === 'validator' && (
        <ConfigValidator />
      )}
    </div>
  );
}
