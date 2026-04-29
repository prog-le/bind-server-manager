import { useState, useEffect } from 'react';
import api from '../api';

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

  useEffect(() => {
    loadSettings();
    checkStatus();
  }, []);

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

      {/* BIND Status */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">BIND 状态</h2>
        <div className="flex items-center space-x-4">
          <span className={`inline-block w-3 h-3 rounded-full ${bindStatus?.running ? 'bg-green-500' : 'bg-red-500'}`}></span>
          <span className={bindStatus?.running ? 'text-green-700' : 'text-red-700'}>
            {bindStatus?.running ? 'BIND 运行中' : 'BIND 未运行'}
          </span>
          <button
            onClick={checkStatus}
            className="text-sm text-primary-600 hover:text-primary-800 ml-4"
          >
            刷新
          </button>
        </div>
        {bindStatus?.output && (
          <pre className="mt-3 bg-gray-50 p-3 rounded text-sm text-gray-600 overflow-x-auto">{bindStatus.output}</pre>
        )}
        {bindStatus?.error && (
          <pre className="mt-3 bg-red-50 p-3 rounded text-sm text-red-600 overflow-x-auto">{bindStatus.error}</pre>
        )}
      </div>

      {/* BIND Paths */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">BIND 配置路径</h2>
        {message && (
          <div className={`p-3 rounded mb-4 text-sm ${message.includes('失败') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
            {message}
          </div>
        )}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">named.conf 路径</label>
            <input
              type="text"
              value={settings.bind_config_path}
              onChange={(e) => setSettings({ ...settings, bind_config_path: e.target.value })}
              placeholder="/etc/named.conf"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Zone 文件目录</label>
            <input
              type="text"
              value={settings.bind_zone_dir}
              onChange={(e) => setSettings({ ...settings, bind_zone_dir: e.target.value })}
              placeholder="/var/named/"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">rndc 路径</label>
            <input
              type="text"
              value={settings.rndc_path}
              onChange={(e) => setSettings({ ...settings, rndc_path: e.target.value })}
              placeholder="/usr/sbin/rndc"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
            />
          </div>
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-primary-600 text-white px-6 py-2 rounded hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存设置'}
            </button>
            <button
              type="button"
              onClick={handleDetect}
              disabled={detecting}
              className="bg-gray-600 text-white px-6 py-2 rounded hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {detecting ? '检测中...' : '自动检测路径'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
