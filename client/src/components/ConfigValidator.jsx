import { useState } from 'react';
import api from '../api';

export default function ConfigValidator() {
  const [results, setResults] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const handleCheckAll = async () => {
    setChecking(true);
    setError('');
    try {
      const res = await api.get('/settings/check-all');
      setResults(res.data);
    } catch (err) {
      setError(err.response?.data?.error || '校验失败');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">BIND 配置校验</h3>
        <button
          onClick={handleCheckAll}
          disabled={checking}
          className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 text-sm"
        >
          {checking ? '校验中...' : '开始校验'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded text-sm">{error}</div>
      )}

      {results && (
        <div className="space-y-4">
          {/* Summary */}
          <div className={`p-4 rounded-lg ${results.summary.healthy ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center space-x-2">
              <span className={`text-2xl ${results.summary.healthy ? 'text-green-600' : 'text-red-600'}`}>
                {results.summary.healthy ? '✓' : '✗'}
              </span>
              <span className={`font-semibold ${results.summary.healthy ? 'text-green-800' : 'text-red-800'}`}>
                {results.summary.healthy ? '配置校验通过' : '配置存在问题'}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              共 {results.summary.total} 个 Zone，{results.summary.valid} 个正常，{results.summary.invalid} 个异常
            </p>
          </div>

          {/* Config issues */}
          {!results.config.valid && (
            <div className="border border-red-200 rounded-lg overflow-hidden">
              <div className="bg-red-100 px-4 py-2 font-medium text-red-800 text-sm">
                主配置文件 ({results.config.path})
              </div>
              <div className="p-4 space-y-2">
                {results.config.issues.map((issue, i) => (
                  <div key={i} className="flex items-start space-x-2 text-sm">
                    <span className={`font-mono px-1.5 py-0.5 rounded text-xs ${issue.severity === 'error' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {issue.severity === 'error' ? '错误' : '警告'}
                    </span>
                    <div>
                      {issue.line && <span className="text-gray-500">行 {issue.line}：</span>}
                      <span className="text-gray-800 dark:text-gray-200">{issue.message}</span>
                      {issue.suggestion && (
                        <p className="text-blue-600 mt-0.5">建议：{issue.suggestion}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Zone issues */}
          {results.zones.filter(z => !z.valid).map((zone) => (
            <div key={zone.name} className="border border-red-200 rounded-lg overflow-hidden">
              <div className="bg-red-100 px-4 py-2 font-medium text-red-800 text-sm">
                Zone: {zone.name} ({zone.path})
              </div>
              <div className="p-4 space-y-2">
                {zone.issues.map((issue, i) => (
                  <div key={i} className="flex items-start space-x-2 text-sm">
                    <span className={`font-mono px-1.5 py-0.5 rounded text-xs ${issue.severity === 'error' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {issue.severity === 'error' ? '错误' : '警告'}
                    </span>
                    <div>
                      {issue.line && <span className="text-gray-500">行 {issue.line}：</span>}
                      <span className="text-gray-800 dark:text-gray-200">{issue.message}</span>
                      {issue.suggestion && (
                        <p className="text-blue-600 mt-0.5">建议：{issue.suggestion}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* All valid zones */}
          {results.zones.filter(z => z.valid).length > 0 && (
            <div className="border border-green-200 rounded-lg overflow-hidden">
              <div className="bg-green-100 px-4 py-2 font-medium text-green-800 text-sm">
                正常 Zone（{results.zones.filter(z => z.valid).length} 个）
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-2">
                  {results.zones.filter(z => z.valid).map((zone) => (
                    <span key={zone.name} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {zone.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
