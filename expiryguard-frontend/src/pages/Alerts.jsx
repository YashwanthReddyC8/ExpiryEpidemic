import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, ArrowLeftRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { alertsApi } from '../api/alerts';
import { useState } from 'react';
import EmptyState from '../components/shared/EmptyState';
import SkeletonCard from '../components/shared/SkeletonCard';
import ReturnMemoModal from '../components/ReturnMemoModal';
import { formatExpiryDate } from '../utils/expiry';

const TYPE_META = {
  expired:  { label: 'Expired',        border: 'border-l-red-600',    dot: 'bg-red-600' },
  d7:       { label: '7-day warning',  border: 'border-l-red-400',    dot: 'bg-red-400' },
  d15:      { label: '15-day warning', border: 'border-l-orange-400', dot: 'bg-orange-400' },
  d30:      { label: '30-day warning', border: 'border-l-amber-400',  dot: 'bg-amber-400' },
  d60:      { label: '60-day notice',  border: 'border-l-emerald-400',dot: 'bg-emerald-400' },
  pickup_scheduled: { label: 'Pickup Scheduled', border: 'border-l-blue-400', dot: 'bg-blue-400' },
};

function groupByDate(items) {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const groups = { Today: [], Yesterday: [], Earlier: [] };
  items.forEach((a) => {
    const d = new Date(a.sent_at).toDateString();
    if (d === today) groups.Today.push(a);
    else if (d === yesterday) groups.Yesterday.push(a);
    else groups.Earlier.push(a);
  });
  return groups;
}

export default function Alerts() {
  const qc = useQueryClient();
  const [readFilter, setReadFilter] = useState(undefined);
  const [page, setPage] = useState(1);
  const [returnBatch, setReturnBatch] = useState(null);
  const LIMIT = 30;

  const { data, isLoading } = useQuery({
    queryKey: ['alerts-page', { read: readFilter, page }],
    queryFn: () => alertsApi.list({ ...(readFilter !== undefined && { read: readFilter }), page, limit: LIMIT }),
    keepPreviousData: true,
  });

  const markRead = useMutation({
    mutationFn: alertsApi.markRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alerts-page'] });
    },
  });

  const markAll = useMutation({
    mutationFn: alertsApi.markAllRead,
    onSuccess: (d) => {
      toast.success(`Marked ${d.updated} as read`);
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alerts-page'] });
    },
  });

  const testWhatsapp = useMutation({
    mutationFn: alertsApi.testWhatsapp,
    onSuccess: (d) => {
      toast.success(d?.detail || 'WhatsApp test message sent');
    },
    onError: (err) => {
      toast.error(err?.response?.data?.detail || 'Failed to send WhatsApp test message');
    },
  });

  const items = data?.items ?? [];
  const unread = data?.unread_count ?? 0;
  const groups = groupByDate(items);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Alerts</h1>
          {unread > 0 && (
            <p className="text-sm font-medium mt-0.5">
              <span className="inline-flex items-center gap-1.5 bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                {unread} unread
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => testWhatsapp.mutate()}
            disabled={testWhatsapp.isPending}
            className="btn-secondary flex items-center gap-1.5 text-sm"
            title="Send a test WhatsApp alert"
          >
            {testWhatsapp.isPending ? 'Sending...' : 'Test WhatsApp'}
          </button>
          {unread > 0 && (
            <button onClick={() => markAll.mutate()} disabled={markAll.isPending} className="btn-secondary flex items-center gap-1.5 text-sm">
              <CheckCheck size={15} /> Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2">
        {[{ label: 'All', value: undefined }, { label: 'Unread', value: false }, { label: 'Read', value: true }].map(({ label, value }) => (
          <button
            key={label}
            onClick={() => { setReadFilter(value); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${readFilter === value ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Alert groups */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <SkeletonCard key={i} variant="alert" className="border border-gray-100 rounded-xl" />)}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="card">
          <EmptyState title="No alerts" description="You're all caught up! 🎉" icon={Bell} />
        </div>
      )}

      {!isLoading && Object.entries(groups).map(([group, groupItems]) => {
        if (!groupItems.length) return null;
        return (
          <div key={group} className="space-y-2">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">{group}</h2>
            <div className="space-y-2">
              {groupItems.map((alert) => {
                const meta = TYPE_META[alert.alert_type] ?? { label: alert.alert_type, border: 'border-l-gray-400', dot: 'bg-gray-400' };
                const showReturn = ['d15', 'd30'].includes(alert.alert_type);
                return (
                  <div
                    key={alert.id}
                    className={`card flex items-start gap-4 px-5 py-4 border-l-4 ${meta.border} ${!alert.read ? 'bg-blue-50/30' : ''}`}
                  >
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${meta.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-gray-900">{alert.product_name}</p>
                        {alert.batch_number && (
                          <span className="text-xs font-mono text-gray-400">{alert.batch_number}</span>
                        )}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600`}>
                          {meta.label}
                        </span>
                        {!alert.read && (
                          <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">NEW</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">{alert.message}</p>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
                        <span>{new Date(alert.sent_at).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                        <span className="capitalize">{alert.sent_via?.replace('_', ' ')}</span>
                        {showReturn && alert.batch_id && (
                          <button
                            onClick={() => setReturnBatch({ id: alert.batch_id, product_name: alert.product_name })}
                            className="flex items-center gap-1 text-primary-600 hover:underline font-medium"
                          >
                            <ArrowLeftRight size={11} /> Initiate Return
                          </button>
                        )}
                      </div>
                    </div>
                    {!alert.read && (
                      <button
                        onClick={() => markRead.mutate(alert.id)}
                        className="flex-shrink-0 p-1.5 rounded hover:bg-white text-gray-400 hover:text-emerald-600 transition-all"
                        title="Mark as read"
                      >
                        <Check size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {items.length === LIMIT && (
        <div className="flex justify-center gap-3 pt-2">
          <button disabled={page === 1} onClick={() => setPage(page - 1)} className="btn-secondary px-4 disabled:opacity-40">← Prev</button>
          <span className="text-sm text-gray-500 self-center">Page {page}</span>
          <button onClick={() => setPage(page + 1)} className="btn-secondary px-4">Next →</button>
        </div>
      )}

      {returnBatch && <ReturnMemoModal batch={returnBatch} onClose={() => setReturnBatch(null)} />}
    </div>
  );
}
