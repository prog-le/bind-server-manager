import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import BatchImportDialog from '../components/BatchImportDialog';
import SubdomainBatchCreator from '../components/SubdomainBatchCreator';

const BASIC_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS'];
const ADVANCED_TYPES = ['TXT', 'SRV', 'CAA', 'PTR'];
const ALL_TYPES = [...BASIC_TYPES, ...ADVANCED_TYPES];

export default function ZoneDetail() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { canWrite } = useAuth();
  const [zone, setZone] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'A', value: '', ttl: 3600, priority: '', weight: '', port: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [backups, setBackups] = useState([]);
  const [showBackups, setShowBackups] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [selectedRecords, setSelectedRecords] = useState(new Set());
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [showSubdomainCreator, setShowSubdomainCreator] = useState(false);

  // Client-side validation
  function validateForm() {
    const errs = [];
    const ttl = parseInt(form.ttl);

    if (!form.name.trim()) errs.push('请输入记录名称');
    else if (form.name !== '@' && form.name !== '*' &&
        !/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(form.name) &&
        !/^\*\.[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(form.name)) {
      errs.push('名称格式无效。请使用 @、主机名、*（泛域名）或 *.子域名');
    }
    if (!form.value.trim()) errs.push('请输入记录值');
    if (isNaN(ttl) || ttl < 60 || ttl > 86400) errs.push('TTL 必须在 60 到 86400 之间');

    if (form.type === 'A') {
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(form.value)) errs.push('无效的 IPv4 地址');
      else if (!form.value.split('.').every(o => { const n = parseInt(o); return n >= 0 && n <= 255; })) errs.push('IPv4 每段必须在 0-255 之间');
    }

    if (form.type === 'AAAA') {
      if (!/^[0-9a-fA-F:]+$/.test(form.value)) errs.push('无效的 IPv6 地址');
    }

    if (form.type === 'MX' || form.type === 'SRV') {
      const pri = parseInt(form.priority);
      if (isNaN(pri) || pri < 0 || pri > 65535) errs.push('优先级必须在 0-65535 之间');
    }

    if (form.type === 'SRV') {
      const w = parseInt(form.weight);
      const p = parseInt(form.port);
      if (isNaN(w) || w < 0 || w > 65535) errs.push('权重必须在 0-65535 之间');
      if (isNaN(p) || p < 0 || p > 65535) errs.push('端口必须在 0-65535 之间');
    }

    if (form.type === 'CNAME' || form.type === 'NS' || form.type === 'PTR') {
      if (/^(\d{1,3}\.){3}\d{1,3}$/.test(form.value) || /^[0-9a-fA-F:]+$/.test(form.value)) {
        errs.push(`${form.type} 记录的值必须是主机名，不能是 IP 地址`);
      }
    }

    return errs;
  }

  useEffect(() => {
    loadZone();
    loadBackups();
  }, [name]);

  async function loadZone() {
    try {
      const res = await api.get(`/zones/${name}`);
      setZone(res.data.zone);
      setRecords(res.data.records);
    } catch (err) {
      if (err.response?.status === 404) {
        navigate('/zones');
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadBackups() {
    try {
      const res = await api.get(`/backups?zone=${name}`);
      setBackups(res.data.backups || []);
    } catch {
      setBackups([]);
    }
  }

  async function handleRestoreBackup(backupId) {
    if (!confirm('确定恢复此备份？当前配置将先被备份。')) return;
    setRestoring(backupId);
    try {
      const res = await api.post(`/backups/${backupId}/restore`);
      alert(res.data.message);
      loadZone();
      loadBackups();
    } catch (err) {
      alert(err.response?.data?.error || '恢复备份失败');
    } finally {
      setRestoring(null);
    }
  }

  function resetForm() {
    setForm({ name: '', type: 'A', value: '', ttl: 3600, priority: '', weight: '', port: '' });
    setEditingRecord(null);
    setShowForm(false);
    setError('');
  }

  function startEdit(record) {
    setEditingRecord(record);
    setForm({
      name: record.name,
      type: record.type,
      value: record.value,
      ttl: record.ttl || 3600,
      priority: record.priority || '',
      weight: record.weight || '',
      port: record.port || '',
    });
    setShowForm(true);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Client-side validation
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setError(validationErrors.join('. '));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        value: form.value.trim(),
        ttl: parseInt(form.ttl) || 3600,
      };
      if (form.priority) payload.priority = parseInt(form.priority);
      if (form.weight) payload.weight = parseInt(form.weight);
      if (form.port) payload.port = parseInt(form.port);

      let resp;
      if (editingRecord) {
        resp = await api.put(`/zones/${name}/records/${editingRecord.id}`, payload);
      } else {
        resp = await api.post(`/zones/${name}/records`, payload);
      }
      const warning = resp.data?.warning;
      resetForm();
      loadZone();
      if (warning) {
        alert('警告：' + warning);
      }
    } catch (err) {
      const errs = err.response?.data?.errors;
      setError(errs ? errs.map(e => e.msg).join(', ') : err.response?.data?.error || '保存记录失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRecord(id) {
    if (!confirm('确定删除此记录？')) return;
    try {
      await api.delete(`/zones/${name}/records/${id}`);
      loadZone();
    } catch (err) {
      alert(err.response?.data?.error || '删除记录失败');
    }
  }

  async function handleReload() {
    try {
      await api.post(`/zones/${name}/reload`);
      alert('Zone 重载成功');
    } catch (err) {
      const data = err.response?.data;
      let msg = data?.details ? `${data.error}: ${data.details}` : (data?.error || '重载 Zone 失败');
      if (data?.hint) msg += '\n\n' + data.hint;
      alert(msg);
    }
  }

  // Batch operations
  function toggleSelectRecord(id) {
    setSelectedRecords(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedRecords.size === visibleRecords.length) {
      setSelectedRecords(new Set());
    } else {
      setSelectedRecords(new Set(visibleRecords.map(r => r.id)));
    }
  }

  async function handleBatchDelete() {
    if (selectedRecords.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedRecords.size} 条记录？`)) return;
    setBatchDeleting(true);
    try {
      await api.delete(`/zones/${name}/records/batch`, { data: { ids: Array.from(selectedRecords) } });
      setSelectedRecords(new Set());
      loadZone();
    } catch (err) {
      alert(err.response?.data?.error || '批量删除失败');
    } finally {
      setBatchDeleting(false);
    }
  }

  async function handleExport(format) {
    try {
      const res = await api.get(`/zones/${name}/records/export?format=${format}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}_records.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('导出失败');
    }
  }

  const visibleRecords = showAdvanced
    ? records
    : records.filter(r => BASIC_TYPES.includes(r.type));

  const availableTypes = showAdvanced ? ALL_TYPES : BASIC_TYPES;

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>;
  }

  if (!zone) return null;

  const isForward = zone.type === 'forward';
  const isSlave = zone.type === 'slave';
  const isReadOnly = isForward || isSlave;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => navigate('/zones')} className="text-primary-600 hover:text-primary-800 text-sm mb-2">
            ← 返回 Zone 列表
          </button>
          <h1 className="text-2xl font-bold">{zone.name}</h1>
          <p className="text-sm text-gray-500">
            类型：<span className={`inline-block text-xs px-2 py-0.5 rounded ${isForward ? 'bg-purple-100 text-purple-800' : isSlave ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>{zone.type}</span>
            {!isForward && <span> | 文件：{zone.file_path}</span>}
          </p>
        </div>
        <div className="flex space-x-3">
          {canWrite && (
            <button
              onClick={handleReload}
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors text-sm"
            >
              重载 Zone
            </button>
          )}
          {canWrite && !isReadOnly && (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700 transition-colors text-sm"
            >
              添加记录
            </button>
          )}
          {isSlave && (
            <span className="text-sm text-gray-500 self-center">从属 Zone 为只读</span>
          )}
          {!canWrite && (
            <span className="text-sm text-gray-500 self-center">当前角色为只读</span>
          )}
        </div>
      </div>

      {isForward ? (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">转发 Zone 配置</h2>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-500">转发类型：</span>{' '}
              <span className="font-mono">{zone.forward_type || 'only'}</span>
            </div>
            <div>
              <span className="text-gray-500">转发服务器：</span>{' '}
              <span className="font-mono">{zone.forwarders || ''}</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            转发 Zone 将 DNS 查询发送到指定的转发服务器，而不是本地解析。此 Zone 不存储 DNS 记录。
          </p>
        </div>
      ) : (
        <>
          {/* Advanced mode toggle */}
          <div className="mb-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showAdvanced}
                onChange={(e) => setShowAdvanced(e.target.checked)}
                className="rounded text-primary-600"
              />
              <span className="text-sm text-gray-700">显示高级记录（TXT、SRV、CAA、PTR）</span>
            </label>
          </div>

          {/* Record Form */}
          {canWrite && showForm && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">
                {editingRecord ? '编辑记录' : '添加记录'}
              </h2>
              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{error}</div>
              )}
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="www、@ 或 *（泛域名）"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">类型</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {availableTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">值</label>
                  <input
                    type="text"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    placeholder={form.type === 'A' ? '192.168.1.1' : form.type === 'AAAA' ? '::1' : 'target.example.com'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">TTL</label>
                  <input
                    type="number"
                    value={form.ttl}
                    onChange={(e) => setForm({ ...form, ttl: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    min="60"
                    max="86400"
                  />
                </div>
                {(form.type === 'MX' || form.type === 'SRV') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
                    <input
                      type="number"
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      min="0"
                      max="65535"
                      required
                    />
                  </div>
                )}
                {form.type === 'SRV' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">权重</label>
                      <input
                        type="number"
                        value={form.weight}
                        onChange={(e) => setForm({ ...form, weight: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        min="0"
                        max="65535"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">端口</label>
                      <input
                        type="number"
                        value={form.port}
                        onChange={(e) => setForm({ ...form, port: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        min="0"
                        max="65535"
                        required
                      />
                    </div>
                  </>
                )}
                <div className="md:col-span-2 lg:col-span-4 flex space-x-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-primary-600 text-white px-6 py-2 rounded hover:bg-primary-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? '保存中...' : (editingRecord ? '更新' : '添加')}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400 transition-colors"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Batch Toolbar */}
          {canWrite && (
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowImportDialog(true)}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                >
                  批量导入
                </button>
                <button
                  onClick={() => setShowSubdomainCreator(true)}
                  className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                  批量创建子域名
                </button>
                <div className="relative group">
                  <button className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                    导出 ▾
                  </button>
                  <div className="absolute left-0 mt-1 w-32 bg-white rounded shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                    <button onClick={() => handleExport('csv')} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100">CSV 格式</button>
                    <button onClick={() => handleExport('json')} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100">JSON 格式</button>
                  </div>
                </div>
                {selectedRecords.size > 0 && (
                  <button
                    onClick={handleBatchDelete}
                    disabled={batchDeleting}
                    className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    {batchDeleting ? '删除中...' : `删除选中 (${selectedRecords.size})`}
                  </button>
                )}
              </div>
              <span className="text-sm text-gray-500">
                {selectedRecords.size > 0 ? `已选 ${selectedRecords.size} / ${visibleRecords.length} 条` : `共 ${visibleRecords.length} 条记录`}
              </span>
            </div>
          )}

          {/* Records Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {canWrite && (
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedRecords.size === visibleRecords.length && visibleRecords.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded text-primary-600"
                      />
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">值</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">TTL</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">附加</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visibleRecords.length === 0 ? (
                  <tr>
                    <td colSpan={canWrite ? 7 : 6} className="px-6 py-8 text-center text-gray-500">
                      暂无记录，请添加您的第一条记录。
                    </td>
                  </tr>
                ) : (
                  visibleRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-gray-50">
                      {canWrite && (
                        <td className="px-3 py-4">
                          <input
                            type="checkbox"
                            checked={selectedRecords.has(rec.id)}
                            onChange={() => toggleSelectRecord(rec.id)}
                            className="rounded text-primary-600"
                          />
                        </td>
                      )}
                      <td className="px-6 py-4 font-mono text-sm">
                        {rec.name === '*' ? (
                          <span className="inline-block bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded font-bold">*（泛域名）</span>
                        ) : rec.name.startsWith('*.') ? (
                          <span className="inline-block bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded">{rec.name}</span>
                        ) : rec.name}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                          {rec.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-sm break-all">{rec.value}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{rec.ttl}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {rec.priority && <span>P:{rec.priority} </span>}
                        {rec.weight && <span>W:{rec.weight} </span>}
                        {rec.port && <span>Port:{rec.port}</span>}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {canWrite && !isReadOnly && (
                          <>
                            <button
                              onClick={() => startEdit(rec)}
                              className="text-primary-600 hover:text-primary-800 text-sm"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleDeleteRecord(rec.id)}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              删除
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Backup History */}
          <div className="mt-6">
            <button
              onClick={() => { setShowBackups(!showBackups); if (!showBackups) loadBackups(); }}
              className="text-sm text-gray-600 hover:text-gray-800 flex items-center space-x-1"
            >
              <span>{showBackups ? '▼' : '▶'}</span>
              <span>备份历史（{backups.length}）</span>
            </button>

            {showBackups && (
              <div className="bg-white rounded-lg shadow overflow-hidden mt-3">
                {backups.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-gray-500">暂无备份记录。</p>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">创建时间</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">原始路径</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {backups.map((bak) => (
                        <tr key={bak.id} className="hover:bg-gray-50">
                          <td className="px-6 py-3 text-sm text-gray-500">{bak.id}</td>
                          <td className="px-6 py-3">
                            <span className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded">
                              {bak.file_type}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-500">{bak.created_at}</td>
                          <td className="px-6 py-3 text-sm font-mono text-gray-500 truncate max-w-xs">{bak.original_path}</td>
                          <td className="px-6 py-3 text-right">
                            {canWrite && (
                              <button
                                onClick={() => handleRestoreBackup(bak.id)}
                                disabled={restoring === bak.id}
                                className="text-primary-600 hover:text-primary-800 text-sm disabled:opacity-50"
                              >
                                {restoring === bak.id ? '恢复中...' : '恢复'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Batch Import Dialog */}
      {showImportDialog && (
        <BatchImportDialog
          zoneName={name}
          onClose={() => setShowImportDialog(false)}
          onImported={() => { setShowImportDialog(false); loadZone(); }}
        />
      )}

      {/* Subdomain Batch Creator */}
      {showSubdomainCreator && (
        <SubdomainBatchCreator
          zoneName={name}
          onClose={() => setShowSubdomainCreator(false)}
          onCreated={() => { setShowSubdomainCreator(false); loadZone(); }}
        />
      )}
    </div>
  );
}
