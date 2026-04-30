import { useState, useEffect } from 'react';
import api from '../api';

const CONDITION_LABELS = {
  bind_down: 'BIND 服务宕机',
  high_cpu: 'CPU 使用率过高',
  high_memory: '内存使用过高',
  config_error: '配置语法错误',
};

export default function Alerts() {
  const [rules, setRules] = useState([]);
  const [history, setHistory] = useState([]);
  const [settings, setSettings] = useState({});
  const [activeTab, setActiveTab] = useState('rules');
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', condition_type: 'bind_down', condition_params: '{}', channels: [] });
  const [emailSettings, setEmailSettings] = useState({ smtp_host: '', smtp_port: 587, smtp_secure: false, smtp_user: '', smtp_pass: '', smtp_from: '', alert_to: '' });
  const [webhookSettings, setWebhookSettings] = useState({ webhook_url: '' });
  const [testResult, setTestResult] = useState(null);

  const fetchRules = async () => {
    try {
      const res = await api.get('/alerts/rules');
      setRules(res.data.rules);
    } catch {}
  };

  const fetchHistory = async () => {
    try {
      const res = await api.get('/alerts/history');
      setHistory(res.data.history);
    } catch {}
  };

  const fetchSettings = async () => {
    try {
      const res = await api.get('/alerts/settings');
      setSettings(res.data.settings);
      if (res.data.settings.email) setEmailSettings(prev => ({ ...prev, ...res.data.settings.email }));
      if (res.data.settings.webhook) setWebhookSettings(prev => ({ ...prev, ...res.data.settings.webhook }));
    } catch {}
  };

  useEffect(() => {
    fetchRules();
    fetchHistory();
    fetchSettings();
  }, []);

  const handleCreateRule = async () => {
    try {
      await api.post('/alerts/rules', {
        ...newRule,
        condition_params: JSON.parse(newRule.condition_params || '{}'),
      });
      setShowCreateRule(false);
      setNewRule({ name: '', condition_type: 'bind_down', condition_params: '{}', channels: [] });
      fetchRules();
    } catch (err) {
      alert(err.response?.data?.error || '创建失败');
    }
  };

  const handleToggleRule = async (rule) => {
    try {
      await api.put(`/alerts/rules/${rule.id}`, { enabled: !rule.enabled });
      fetchRules();
    } catch {}
  };

  const handleDeleteRule = async (id) => {
    if (!confirm('确定删除此规则？')) return;
    try {
      await api.delete(`/alerts/rules/${id}`);
      fetchRules();
    } catch {}
  };

  const handleSaveEmailSettings = async () => {
    try {
      await api.put('/alerts/settings/email', emailSettings);
      alert('邮件配置已保存');
    } catch {
      alert('保存失败');
    }
  };

  const handleSaveWebhookSettings = async () => {
    try {
      await api.put('/alerts/settings/webhook', webhookSettings);
      alert('Webhook 配置已保存');
    } catch {
      alert('保存失败');
    }
  };

  const handleTestChannel = async (channel) => {
    setTestResult(null);
    try {
      const res = await api.post(`/alerts/test/${channel}`);
      setTestResult({ channel, ...res.data });
    } catch (err) {
      setTestResult({ channel, success: false, error: err.response?.data?.error || '测试失败' });
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">告警管理</h2>
        <div className="flex space-x-3">
          <button onClick={() => setShowSettings(!showSettings)} className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700">
            {showSettings ? '隐藏设置' : '通道设置'}
          </button>
          <button onClick={() => setShowCreateRule(!showCreateRule)} className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700">
            {showCreateRule ? '取消' : '新建规则'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 mb-4 border-b">
        <button onClick={() => setActiveTab('rules')} className={`pb-2 px-1 text-sm font-medium ${activeTab === 'rules' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500'}`}>告警规则</button>
        <button onClick={() => setActiveTab('history')} className={`pb-2 px-1 text-sm font-medium ${activeTab === 'history' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500'}`}>告警历史</button>
      </div>

      {/* Channel Settings */}
      {showSettings && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h3 className="font-semibold mb-3">邮件告警配置</h3>
            <div className="space-y-2">
              <input value={emailSettings.smtp_host} onChange={e => setEmailSettings({...emailSettings, smtp_host: e.target.value})} placeholder="SMTP 服务器" className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600" />
              <div className="flex space-x-2">
                <input value={emailSettings.smtp_port} onChange={e => setEmailSettings({...emailSettings, smtp_port: parseInt(e.target.value) || 587})} placeholder="端口" type="number" className="w-24 border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600" />
                <label className="flex items-center space-x-2 text-sm"><input type="checkbox" checked={emailSettings.smtp_secure} onChange={e => setEmailSettings({...emailSettings, smtp_secure: e.target.checked})} /><span>SSL</span></label>
              </div>
              <input value={emailSettings.smtp_user} onChange={e => setEmailSettings({...emailSettings, smtp_user: e.target.value})} placeholder="SMTP 用户名" className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600" />
              <input value={emailSettings.smtp_pass} onChange={e => setEmailSettings({...emailSettings, smtp_pass: e.target.value})} placeholder="SMTP 密码" type="password" className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600" />
              <input value={emailSettings.smtp_from} onChange={e => setEmailSettings({...emailSettings, smtp_from: e.target.value})} placeholder="发件人地址" className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600" />
              <input value={emailSettings.alert_to} onChange={e => setEmailSettings({...emailSettings, alert_to: e.target.value})} placeholder="收件人地址" className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600" />
              <div className="flex space-x-2">
                <button onClick={handleSaveEmailSettings} className="px-4 py-2 bg-primary-600 text-white rounded text-sm hover:bg-primary-700">保存</button>
                <button onClick={() => handleTestChannel('email')} className="px-4 py-2 bg-gray-600 text-white rounded text-sm hover:bg-gray-700">测试发送</button>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h3 className="font-semibold mb-3">Webhook 告警配置</h3>
            <div className="space-y-2">
              <input value={webhookSettings.webhook_url} onChange={e => setWebhookSettings({...webhookSettings, webhook_url: e.target.value})} placeholder="Webhook URL（企业微信/钉钉/飞书）" className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600" />
              <p className="text-xs text-gray-500">支持企业微信、钉钉、飞书的 Webhook 地址，以及通用 HTTP Webhook</p>
              <div className="flex space-x-2">
                <button onClick={handleSaveWebhookSettings} className="px-4 py-2 bg-primary-600 text-white rounded text-sm hover:bg-primary-700">保存</button>
                <button onClick={() => handleTestChannel('webhook')} className="px-4 py-2 bg-gray-600 text-white rounded text-sm hover:bg-gray-700">测试发送</button>
              </div>
            </div>
          </div>
          {testResult && (
            <div className={`md:col-span-2 p-3 rounded text-sm ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {testResult.success ? `${testResult.channel} 测试发送成功` : `测试失败：${testResult.error}`}
            </div>
          )}
        </div>
      )}

      {/* Create Rule */}
      {showCreateRule && (
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="font-semibold mb-3">新建告警规则</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={newRule.name} onChange={e => setNewRule({...newRule, name: e.target.value})} placeholder="规则名称" className="border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600" />
            <select value={newRule.condition_type} onChange={e => setNewRule({...newRule, condition_type: e.target.value})} className="border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600">
              {Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="mt-3 flex items-center space-x-4">
            <span className="text-sm text-gray-500">告警通道：</span>
            <label className="flex items-center space-x-1 text-sm"><input type="checkbox" checked={newRule.channels.includes('email')} onChange={e => setNewRule({...newRule, channels: e.target.checked ? [...newRule.channels, 'email'] : newRule.channels.filter(c => c !== 'email')})} /><span>邮件</span></label>
            <label className="flex items-center space-x-1 text-sm"><input type="checkbox" checked={newRule.channels.includes('webhook')} onChange={e => setNewRule({...newRule, channels: e.target.checked ? [...newRule.channels, 'webhook'] : newRule.channels.filter(c => c !== 'webhook')})} /><span>Webhook</span></label>
          </div>
          <button onClick={handleCreateRule} className="mt-3 px-4 py-2 bg-primary-600 text-white rounded text-sm hover:bg-primary-700">创建</button>
        </div>
      )}

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          {rules.length === 0 ? (
            <p className="p-6 text-center text-gray-500">暂无告警规则</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">规则名称</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">条件</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">通道</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {rules.map(rule => (
                  <tr key={rule.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3 text-sm font-medium">{rule.name}</td>
                    <td className="px-4 py-3 text-sm">{CONDITION_LABELS[rule.condition_type] || rule.condition_type}</td>
                    <td className="px-4 py-3 text-sm">{JSON.parse(rule.channels || '[]').join(', ') || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <button onClick={() => handleToggleRule(rule)} className={`px-2 py-1 text-xs rounded ${rule.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                        {rule.enabled ? '已启用' : '已禁用'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <button onClick={() => handleDeleteRule(rule.id)} className="text-red-600 hover:text-red-800">删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          {history.length === 0 ? (
            <p className="p-6 text-center text-gray-500">暂无告警记录</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">时间</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">规则</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">通道</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">消息</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {history.map(h => (
                  <tr key={h.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{h.created_at}</td>
                    <td className="px-4 py-3 text-sm font-medium">{h.rule_name}</td>
                    <td className="px-4 py-3 text-sm">{h.channel}</td>
                    <td className="px-4 py-3 text-sm max-w-xs truncate" title={h.message}>{h.message}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`text-xs px-2 py-1 rounded ${h.status === 'sent' ? 'bg-green-100 text-green-800' : h.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {h.status === 'sent' ? '已发送' : h.status === 'failed' ? '失败' : '发送中'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
