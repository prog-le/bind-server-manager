import { useState, useRef } from 'react';
import api from '../api';

export default function BatchImportDialog({ zoneName, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [format, setFormat] = useState('csv');
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const fileRef = useRef();

  const handleFileSelect = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setError('');
    setResults(null);

    // Auto-detect format
    if (f.name.endsWith('.json')) {
      setFormat('json');
    } else {
      setFormat('csv');
    }

    // Read and preview
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const content = evt.target.result;
        let records;
        if (f.name.endsWith('.json')) {
          const parsed = JSON.parse(content);
          records = Array.isArray(parsed) ? parsed : parsed.records || [];
        } else {
          // CSV preview - just show first few lines
          setPreview({ raw: content.split('\n').slice(0, 6).join('\n'), count: content.split('\n').length - 1 });
          return;
        }
        setPreview({ records: records.slice(0, 5), total: records.length });
      } catch (err) {
        setError('文件解析失败：' + err.message);
      }
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError('');

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const content = evt.target.result;
          const res = await api.post(`/zones/${zoneName}/records/import`, {
            data: content,
            format: file.name.endsWith('.json') ? 'json' : 'csv',
          });
          setResults(res.data);
          if (onImported) onImported();
        } catch (err) {
          setError(err.response?.data?.error || '导入失败');
          if (err.response?.data?.details) {
            setError(err.response.data.error + '\n' + err.response.data.details.map(d =>
              `第${d.index + 1}条: ${d.errors?.join(', ') || d.error}`
            ).join('\n'));
          }
        } finally {
          setImporting(false);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      setError('导入失败：' + err.message);
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold">批量导入记录</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Format info */}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p className="mb-2">支持 CSV 和 JSON 格式。CSV 文件需包含表头行。</p>
            <p className="font-medium">CSV 格式示例：</p>
            <pre className="bg-gray-100 dark:bg-gray-700 p-2 rounded text-xs mt-1 overflow-x-auto">
{`name,type,value,ttl
www,A,192.168.1.10,3600
mail,A,192.168.1.20,3600
api,CNAME,www,3600`}
            </pre>
            <p className="font-medium mt-2">JSON 格式示例：</p>
            <pre className="bg-gray-100 dark:bg-gray-700 p-2 rounded text-xs mt-1 overflow-x-auto">
{`[{"name":"www","type":"A","value":"192.168.1.10","ttl":3600}]`}
            </pre>
          </div>

          {/* File input */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json"
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
            />
          </div>

          {/* Preview */}
          {preview && !results && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded p-3">
              <p className="text-sm font-medium mb-2">预览（共 {preview.total || preview.count} 条记录）：</p>
              {preview.records ? (
                <pre className="text-xs overflow-x-auto max-h-32 overflow-y-auto">
                  {JSON.stringify(preview.records, null, 2)}
                </pre>
              ) : (
                <pre className="text-xs overflow-x-auto max-h-32 overflow-y-auto">{preview.raw}</pre>
              )}
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
              {results.created && (
                <p className="mt-1">已创建 {results.created.length} 条记录</p>
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
              onClick={handleImport}
              disabled={!file || importing}
              className="px-4 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
            >
              {importing ? '导入中...' : '开始导入'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
