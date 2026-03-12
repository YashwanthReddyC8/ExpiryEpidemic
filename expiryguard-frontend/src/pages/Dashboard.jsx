import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Package, Plus, Camera, FileText, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { dashboardApi } from '../api/dashboard';
import { alertsApi } from '../api/alerts';
import { formatINR, formatExpiryDate, getExpiryChartColor } from '../utils/expiry';
import ExpiryBadge from '../components/shared/ExpiryBadge';
import SkeletonCard from '../components/shared/SkeletonCard';

function KpiCard({ label, value, sublabel, colorClass, borderClass, loading }) {
  if (loading) return <SkeletonCard />;
  return (
    <div className={`card flex flex-col p-5 border-l-4 ${borderClass}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${colorClass} leading-none mb-1`}>{value}</p>
      {sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: summary, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.getSummary,
    refetchInterval: 60_000,
  });

  const { data: alertData } = useQuery({
    queryKey: ['alerts', { page: 1, limit: 5 }],
    queryFn: () => alertsApi.list({ page: 1, limit: 5 }),
  });

  const markRead = useMutation({
    mutationFn: alertsApi.markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const kpis = [
    { label: 'Expiring in 7 days',  value: summary?.expiring_7 ?? 0,           sublabel: 'batches',       colorClass: 'text-red-500',     borderClass: 'border-l-red-400' },
    { label: 'Expiring in 30 days', value: summary?.expiring_30 ?? 0,           sublabel: 'batches',       colorClass: 'text-orange-500',  borderClass: 'border-l-orange-400' },
    { label: 'Expiring in 60 days', value: summary?.expiring_60 ?? 0,           sublabel: 'batches',       colorClass: 'text-amber-500',   borderClass: 'border-l-amber-400' },
    { label: 'Total Active SKUs',   value: summary?.total_skus ?? 0,            sublabel: 'distinct SKUs', colorClass: 'text-primary-600', borderClass: 'border-l-primary-400' },
    { label: 'At Risk Value',       value: formatINR(summary?.at_risk_value ?? 0), sublabel: 'expiring ≤30d', colorClass: 'text-purple-600', borderClass: 'border-l-purple-400' },
  ];

  const chartData = (summary?.weekly_expiry_chart ?? []).map((w, i) => ({
    name: `Wk ${i + 1}`,
    count: w.count,
    fill: getExpiryChartColor(i),
  }));

  const recentAlerts = alertData?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Your inventory at a glance</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} loading={isLoading} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Expiry Timeline Chart */}
        <div className="lg:col-span-2 card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Upcoming expirations by week</h2>
          {isLoading ? (
            <SkeletonCard className="h-56" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                  formatter={(v) => [v, 'Batches']}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Recent Alerts */}
        <div className="card p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Recent alerts</h2>
            <button
              onClick={() => navigate('/alerts')}
              className="text-xs text-primary-600 font-medium hover:underline"
            >
              View all →
            </button>
          </div>
          {isLoading ? (
            <div className="space-y-3 flex-1">
              {[...Array(4)].map((_, i) => <SkeletonCard key={i} variant="alert" className="border-none p-0" />)}
            </div>
          ) : recentAlerts.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
              No alerts — looking good! ✅
            </div>
          ) : (
            <div className="space-y-3 flex-1">
              {recentAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    alert.alert_type === 'expired' ? 'bg-red-500' :
                    alert.alert_type === 'd7' ? 'bg-red-400' :
                    alert.alert_type === 'd15' ? 'bg-orange-400' :
                    alert.alert_type === 'd30' ? 'bg-amber-400' : 'bg-emerald-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{alert.product_name}</p>
                    <p className="text-xs text-gray-400 truncate">{alert.message.slice(0, 55)}…</p>
                  </div>
                  {!alert.read && (
                    <button
                      onClick={() => markRead.mutate(alert.id)}
                      className="text-xs text-primary-600 hover:underline flex-shrink-0"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate('/inventory')}
            className="flex items-center gap-2 btn-primary"
          >
            <Plus size={16} /> Add Batch
          </button>
          <button
            onClick={() => navigate('/inventory')}
            className="flex items-center gap-2 btn-secondary"
          >
            <Camera size={16} /> Scan Barcode
          </button>
          <button
            onClick={() => navigate('/inventory')}
            className="flex items-center gap-2 btn-secondary"
          >
            <FileText size={16} /> Upload Invoice
          </button>
        </div>
      </div>
    </div>
  );
}
