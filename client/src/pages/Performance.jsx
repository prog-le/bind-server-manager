import { useState, useEffect } from 'react';
import api from '../api';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function Performance() {
  const [data, setData] = useState(null);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPerformance();
  }, [hours]);

  async function fetchPerformance() {
    setLoading(true);
    try {
      const res = await api.get(`/dns-logs/performance?hours=${hours}`);
      setData(res.data);
    } catch {} finally {
      setLoading(false);
    }
  }

  if (loading && !data) return <div className="flex items-center justify-center h-64">加载中...</div>;
  if (!data) return <div className="p-6 text-center text-gray-500">无法加载性能数据</div>;

  const successRateData = (data.successTrend || []).filter(d => d.hour).map(d => ({
    hour: d.hour.slice(5),
    rate: d.total > 0 ? parseFloat(((d.success / d.total) * 100).toFixed(1)) : 0,
  }));

  const latencyData = (data.latencyTrend || []).filter(d => d.hour).map(d => ({
    hour: d.hour.slice(5),
    avg: Math.round(d.avg_ms),
    count: d.count,
  }));

  const volumeData = (data.volumeTrend || []).filter(d => d.hour).map(d => ({
    hour: d.hour.slice(5),
    count: d.count,
  }));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">DNS 解析性能看板</h2>
        <div className="flex space-x-2">
          {[6, 12, 24, 48, 168].map(h => (
            <button key={h} onClick={() => setHours(h)} className={`px-3 py-1 text-sm rounded ${hours === h ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
              {h < 24 ? `${h}小时` : `${h / 24}天`}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">总查询量</div>
          <div className="text-2xl font-bold mt-1">{data.total.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">解析成功率</div>
          <div className={`text-2xl font-bold mt-1 ${data.successRate >= 99 ? 'text-green-600' : data.successRate >= 95 ? 'text-yellow-600' : 'text-red-600'}`}>
            {data.successRate}%
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">平均延迟</div>
          <div className="text-2xl font-bold mt-1">{data.latency.avg !== null ? `${data.latency.avg} ms` : '-'}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">最大延迟</div>
          <div className="text-2xl font-bold mt-1">{data.latency.max !== null ? `${data.latency.max} ms` : '-'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Success Rate Trend */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="font-semibold mb-4">解析成功率趋势</h3>
          {successRateData.length === 0 ? (
            <p className="text-center text-gray-500 py-8">暂无数据</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={successRateData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={v => `${v}%`} />
                <Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} dot={false} name="成功率" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Latency Trend */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="font-semibold mb-4">平均延迟趋势</h3>
          {latencyData.length === 0 ? (
            <p className="text-center text-gray-500 py-8">暂无数据</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={latencyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="ms" />
                <Tooltip formatter={v => `${v} ms`} />
                <Line type="monotone" dataKey="avg" stroke="#3b82f6" strokeWidth={2} dot={false} name="平均延迟" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Request Volume */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="font-semibold mb-4">请求量趋势</h3>
          {volumeData.length === 0 ? (
            <p className="text-center text-gray-500 py-8">暂无数据</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={volumeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" name="查询数" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Query Type Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="font-semibold mb-4">查询类型分布</h3>
          {(data.typeDistribution || []).length === 0 ? (
            <p className="text-center text-gray-500 py-8">暂无数据</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={data.typeDistribution} dataKey="count" nameKey="query_type" cx="50%" cy="50%" outerRadius={80} label={({ query_type, percent }) => `${query_type} ${(percent * 100).toFixed(0)}%`}>
                  {(data.typeDistribution || []).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Failure Codes */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="font-semibold mb-4">失败响应码分布</h3>
          {(data.failureCodes || []).length === 0 ? (
            <p className="text-center text-gray-500 py-8">无失败记录</p>
          ) : (
            <table className="min-w-full">
              <thead>
                <tr className="border-b dark:border-gray-700">
                  <th className="text-left py-2 text-sm font-medium text-gray-500">响应码</th>
                  <th className="text-right py-2 text-sm font-medium text-gray-500">次数</th>
                </tr>
              </thead>
              <tbody>
                {data.failureCodes.map((d, i) => (
                  <tr key={i} className="border-b dark:border-gray-700 last:border-0">
                    <td className="py-2 text-sm font-mono">{d.response_code}</td>
                    <td className="py-2 text-sm text-right">{d.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Failing Domains */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="font-semibold mb-4">失败请求 Top 域名</h3>
          {(data.failingDomains || []).length === 0 ? (
            <p className="text-center text-gray-500 py-8">无失败记录</p>
          ) : (
            <table className="min-w-full">
              <thead>
                <tr className="border-b dark:border-gray-700">
                  <th className="text-left py-2 text-sm font-medium text-gray-500">域名</th>
                  <th className="text-right py-2 text-sm font-medium text-gray-500">失败次数</th>
                </tr>
              </thead>
              <tbody>
                {data.failingDomains.map((d, i) => (
                  <tr key={i} className="border-b dark:border-gray-700 last:border-0">
                    <td className="py-2 text-sm font-mono truncate max-w-xs">{d.query_name}</td>
                    <td className="py-2 text-sm text-right text-red-600">{d.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
