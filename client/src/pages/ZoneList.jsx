import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

export default function ZoneList() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneType, setNewZoneType] = useState('master');
  const [newForwarders, setNewForwarders] = useState('');
  const [newForwardType, setNewForwardType] = useState('only');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadZones();
  }, []);

  async function loadZones() {
    try {
      const res = await api.get('/zones');
      setZones(res.data.zones);
    } catch (err) {
      console.error('Failed to load zones:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const payload = { name: newZoneName, type: newZoneType };
      if (newZoneType === 'forward') {
        payload.forwarders = newForwarders;
        payload.forward_type = newForwardType;
      }
      await api.post('/zones', payload);
      setNewZoneName('');
      setNewZoneType('master');
      setNewForwarders('');
      setNewForwardType('only');
      setShowCreate(false);
      loadZones();
    } catch (err) {
      setError(err.response?.data?.error || '创建 Zone 失败');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(name) {
    if (!confirm(`确定删除 Zone "${name}"？这将删除所有记录和 Zone 文件。`)) return;
    try {
      await api.delete(`/zones/${name}`);
      loadZones();
    } catch (err) {
      alert(err.response?.data?.error || '删除 Zone 失败');
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">DNS Zone 管理</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700 transition-colors"
        >
          {showCreate ? '取消' : '创建 Zone'}
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">创建新 Zone</h2>
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{error}</div>
          )}
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="flex space-x-4">
              <input
                type="text"
                value={newZoneName}
                onChange={(e) => setNewZoneName(e.target.value)}
                placeholder="example.com"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
              <select
                value={newZoneType}
                onChange={(e) => setNewZoneType(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="master">Master</option>
                <option value="slave">Slave</option>
                <option value="forward">Forward</option>
              </select>
              <button
                type="submit"
                disabled={creating}
                className="bg-primary-600 text-white px-6 py-2 rounded hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
            {newZoneType === 'forward' && (
              <div className="flex space-x-4">
                <input
                  type="text"
                  value={newForwarders}
                  onChange={(e) => setNewForwarders(e.target.value)}
                  placeholder="转发服务器（如 8.8.8.8; 8.8.4.4）"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
                <select
                  value={newForwardType}
                  onChange={(e) => setNewForwardType(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="only">only</option>
                  <option value="first">first</option>
                </select>
              </div>
            )}
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Zone 名称</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">详情</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">创建时间</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {zones.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                  暂无 Zone，请创建您的第一个 Zone。
                </td>
              </tr>
            ) : (
              zones.map((zone) => (
                <tr key={zone.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link to={`/zones/${zone.name}`} className="text-primary-600 hover:text-primary-800 font-medium">
                      {zone.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block text-xs px-2 py-1 rounded ${zone.type === 'forward' ? 'bg-purple-100 text-purple-800' : zone.type === 'slave' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                      {zone.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 font-mono">
                    {zone.type === 'forward'
                      ? `${zone.forward_type || 'only'}: ${zone.forwarders || ''}`
                      : zone.file_path}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{zone.created_at}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDelete(zone.name)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
