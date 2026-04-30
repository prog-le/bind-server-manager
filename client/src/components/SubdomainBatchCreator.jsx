import { useState } from 'react';
import api from '../api';

export default function SubdomainBatchCreator({ zoneName, onClose, onCreated }) {
  const [subdomains, setSubdomains] = useState('');
  const [type, setType] = useState('A');
  const [value, setValue] = useState('');
  const [ttl, setTtl] = useState(3600);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);

  const parsedSubdomains = subdomains
    .split(/[,\n\r]+/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);

  const handleCreate = async () => {
    if (parsedSubdomains.length === 0) {
      setError('请输入至少一个子域名');
      return;
    }
    if (!value.trim()) {
      setError('请输入目标值');
      return;
    }

    setCreating(true);
    setError('');
    try {
      const res = await api.post(`/zones/${zoneName}/subdomains`, {
        subdomains: parsedSubdomains,
        type,
        value: value.trim(),
        ttl: parseInt(ttl) || 3600,
      });
      setResults(res.data);
      if (onCreated) onCreated();
    } catch (err) {
      setError(err.response?.data?.error || '创建失败');
      if (err.response?.data?.errors) {
        setError(err.response.data.error + '\n' + err.response.data.errors.map(e =>
          `"${e.name}": ${e.error || e.errors?.join(', ')}`
        ).join('\n'));
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold">批量创建子域名</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              子域名列表（逗号或换行分隔）
            </label>
            <textarea
              value={subdomains}
              onChange={e => setSubdomains(e.target.value)}
              placeholder={`www\nmail\napi\ndev\noa`}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 font-mono text-sm"
            />
            {parsedSubdomains.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">将创建 {parsedSubdomains.length} 个子域名</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">记录类型</label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="A">A（IPv4）</option>
                <option value="AAAA">AAAA（IPv6）</option>
                <option value="CNAME">CNAME（别名）</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                目标值（{type === 'CNAME' ? '域名' : 'IP 地址'}）
              </label>
              <input
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={type === 'CNAME' ? 'target.example.com' : '192.168.1.10'}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">TTL</label>
            <input
              type="number"
              value={ttl}
              onChange={e => setTtl(e.target.value)}
              min={60}
              max={86400}
              className="w-32 px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
            />
          </div>

          {/* Preview */}
          {parsedSubdomains.length > 0 && value && !results && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded p-3">
              <p className="text-sm font-medium mb-2">预览：</p>
              <div className="text-xs font-mono space-y-0.5 max-h-32 overflow-y-auto">
                {parsedSubdomains.slice(0, 10).map(sub => (
                  <div key={sub}>{sub}.{zoneName} → {type} {value}</div>
                ))}
                {parsedSubdomains.length > 10 && (
                  <div className="text-gray-500">...还有 {parsedSubdomains.length - 10} 条</div>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded text-sm whitespace-pre-wrap">{error}</div>
          )}

          {/* Results */}
          {results && (
            <div className="bg-green-50 text-green-700 p-3 rounded text-sm">
              <p className="font-medium">{results.message}</p>
              {results.errors?.length > 0 && (
                <div className="mt-2 text-red-600">
                  <p className="font-medium">以下子域名创建失败：</p>
                  {results.errors.map((e, i) => (
                    <p key={i} className="text-xs">- {e.name}: {e.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            {results ? '关闭' : '取消'}
          </button>
          {!results && (
            <button
              onClick={handleCreate}
              disabled={creating || parsedSubdomains.length === 0 || !value}
              className="px-4 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
            >
              {creating ? '创建中...' : `创建 ${parsedSubdomains.length} 个子域名`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
