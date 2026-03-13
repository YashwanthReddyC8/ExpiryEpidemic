import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ChevronLeft, ChevronRight, ArrowLeftRight, Tag, Gift, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { batchesApi } from '../api/batches';
import { productsApi } from '../api/products';
import { stockRequestsApi } from '../api/stockRequests';
import { formatExpiryDate, getExpiryBg } from '../utils/expiry';
import ExpiryBadge from '../components/shared/ExpiryBadge';
import EmptyState from '../components/shared/EmptyState';
import SkeletonCard from '../components/shared/SkeletonCard';
import AddBatchModal from '../components/AddBatchModal';
import ReturnMemoModal from '../components/ReturnMemoModal';
import DiscountModal from '../components/DiscountModal';
import { useAuthStore } from '../store/authStore';

const STATUS_OPTIONS = ['', 'active', 'expiring_soon', 'expired', 'returned', 'donated', 'discounted'];
const STATUS_LABELS = { '': 'All statuses', active: 'Active', expiring_soon: 'Expiring Soon', expired: 'Expired', returned: 'Returned', donated: 'Donated', discounted: 'Discounted' };

const DAYS_PRESETS = [
  { label: 'All', daysMin: undefined, daysMax: undefined },
  { label: '< 7 days', daysMin: 0, daysMax: 7 },
  { label: '7 – 30', daysMin: 7, daysMax: 30 },
  { label: '30 – 60', daysMin: 30, daysMax: 60 },
];

export default function Inventory() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isShopkeeper = user?.role === 'shopkeeper';
  const isDistributor = user?.role === 'distributor';
  const [filters, setFilters] = useState({ status: '', productId: '', daysPreset: 0, search: '', page: 1 });
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState(0);
  const [returnBatch, setReturnBatch] = useState(null);
  const [discountBatch, setDiscountBatch] = useState(null);

  const preset = DAYS_PRESETS[filters.daysPreset];
  const queryParams = {
    page: filters.page,
    limit: 25,
    ...(filters.status && { status: filters.status }),
    ...(filters.productId && { product_id: filters.productId }),
    ...(preset.daysMin !== undefined && { days_min: preset.daysMin }),
    ...(preset.daysMax !== undefined && { days_max: preset.daysMax }),
  };

  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: productsApi.list });
  const { data: myRequests = [] } = useQuery({
    queryKey: ['stock-requests-mine'],
    queryFn: stockRequestsApi.listMine,
    enabled: isShopkeeper,
    refetchInterval: 15_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['batches', queryParams],
    queryFn: () => batchesApi.list(queryParams),
    keepPreviousData: true,
  });

  const deleteMutation = useMutation({
    mutationFn: batchesApi.delete,
    onSuccess: () => { toast.success('Batch deleted'); qc.invalidateQueries({ queryKey: ['batches'] }); },
    onError: () => toast.error('Delete failed'),
  });

  const donateMutation = useMutation({
    mutationFn: (id) => batchesApi.updateStatus(id, 'donated'),
    onSuccess: () => { toast.success('Marked as donated'); qc.invalidateQueries({ queryKey: ['batches'] }); },
  });

  // Client-side search filter
  const allItems = data?.items ?? [];
  const items = filters.search
    ? allItems.filter((b) =>
        b.product_name?.toLowerCase().includes(filters.search.toLowerCase()) ||
        b.batch_number?.toLowerCase().includes(filters.search.toLowerCase())
      )
    : allItems;

  const total = data?.total ?? 0;
  const page = data?.page ?? 1;
  const totalPages = Math.ceil(total / 25);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500">Manage your batch expiry records</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setAddTab(1); setAddOpen(true); }} className="btn-secondary flex items-center gap-1.5">
            <Search size={15} /> Scan
          </button>
          <button onClick={() => { setAddTab(0); setAddOpen(true); }} className="btn-primary flex items-center gap-1.5">
            <Plus size={15} /> Add Batch
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-8 py-1.5"
            placeholder="Search product or batch…"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
          />
        </div>

        <select
          className="select flex-shrink-0 w-40 py-1.5"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
        >
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>

        <select
          className="select flex-shrink-0 w-52 py-1.5"
          value={filters.productId}
          onChange={(e) => setFilters({ ...filters, productId: e.target.value, page: 1 })}
        >
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
          ))}
        </select>

        <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
          {DAYS_PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => setFilters({ ...filters, daysPreset: i, page: 1 })}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                filters.daysPreset === i ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Requested From Supplier (shopkeeper only) */}
      {isShopkeeper && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Requested From Supplier</h2>
            <p className="text-xs text-gray-500 mt-0.5">Track requested quantities and approval status</p>
          </div>
          {myRequests.length === 0 ? (
            <div className="px-4 py-4 text-sm text-gray-400">No supplier requests yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-white">
                    {['Product', 'SKU', 'Requested', 'Allocated', 'Price', 'Distributor', 'Status'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {myRequests.slice(0, 8).map((req) => {
                    const statusColor =
                      req.status === 'fulfilled' ? 'bg-emerald-100 text-emerald-700' :
                      req.status === 'approved' || req.status === 'partially_approved' ? 'bg-blue-100 text-blue-700' :
                      req.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                      req.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600';

                    const price = Number(req.approved_unit_price || req.quoted_unit_price || 0).toFixed(2);

                    return (
                      <tr key={req.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{req.product_name}</td>
                        <td className="px-4 py-2.5 text-xs font-mono text-gray-500">{req.supplier_sku || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-600">{req.requested_quantity}</td>
                        <td className="px-4 py-2.5 text-gray-600">{req.allocated_quantity || 0}</td>
                        <td className="px-4 py-2.5 text-gray-600">Rs {price}</td>
                        <td className="px-4 py-2.5 text-gray-600">{req.distributor_name || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColor}`}>
                            {String(req.status || '').replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Product', 'Batch No.', 'Expiry', 'Days Left', 'Qty', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && [...Array(8)].map((_, i) => <SkeletonCard key={i} variant="row" />)}
              {!isLoading && items.length === 0 && (
                <tr><td colSpan={7}>
                  <EmptyState
                    title="No batches found"
                    description="Add your first batch or change your filters."
                    action={
                      <button onClick={() => setAddOpen(true)} className="btn-primary flex items-center gap-1.5">
                        <Plus size={15} /> Add Batch
                      </button>
                    }
                  />
                </td></tr>
              )}
              {!isLoading && items.map((batch) => {
                const days = batch.days_to_expiry ?? 0;
                const expired = batch.status === 'expired';
                const otherStatus = !['active', 'expiring_soon', 'expired'].includes(batch.status);
                const rowBg = otherStatus ? 'bg-gray-50' : getExpiryBg(days);
                return (
                  <tr key={batch.id} className={`border-b border-gray-100 last:border-0 ${rowBg} hover:brightness-95 transition-all`}>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[160px] truncate">{batch.product_name}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{batch.batch_number ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatExpiryDate(batch.expiry_date)}</td>
                    <td className="px-4 py-3">
                      <ExpiryBadge days={days} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{batch.quantity}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                        batch.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                        batch.status === 'expiring_soon' ? 'bg-orange-100 text-orange-700' :
                        batch.status === 'expired' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {batch.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          title="Generate Return Memo"
                          onClick={() => setReturnBatch(batch)}
                          className="p-1.5 rounded-md hover:bg-white hover:shadow-sm text-gray-500 hover:text-primary-600 transition-all"
                          hidden={isDistributor}
                        >
                          <ArrowLeftRight size={14} />
                        </button>
                        <button
                          title="Discount Suggestion"
                          onClick={() => setDiscountBatch(batch)}
                          className="p-1.5 rounded-md hover:bg-white hover:shadow-sm text-gray-500 hover:text-amber-600 transition-all"
                          hidden={isShopkeeper}
                        >
                          <Tag size={14} />
                        </button>
                        <button
                          title="Mark as Donated"
                          onClick={() => {
                            if (confirm(`Mark "${batch.product_name}" as donated?`)) donateMutation.mutate(batch.id);
                          }}
                          className="p-1.5 rounded-md hover:bg-white hover:shadow-sm text-gray-500 hover:text-emerald-600 transition-all"
                        >
                          <Gift size={14} />
                        </button>
                        <button
                          title="Delete batch"
                          onClick={() => {
                            if (confirm(`Delete batch "${batch.batch_number ?? batch.product_name}"?`)) deleteMutation.mutate(batch.id);
                          }}
                          className="p-1.5 rounded-md hover:bg-white hover:shadow-sm text-gray-500 hover:text-red-600 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Showing {Math.min((page - 1) * 25 + 1, total)}–{Math.min(page * 25, total)} of {total} batches
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setFilters({ ...filters, page: page - 1 })}
                className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-gray-600">Page {page} of {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setFilters({ ...filters, page: page + 1 })}
                className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AddBatchModal open={addOpen} onClose={() => setAddOpen(false)} initialTab={addTab} />
      {!isDistributor && returnBatch && <ReturnMemoModal batch={returnBatch} onClose={() => setReturnBatch(null)} />}
      {!isShopkeeper && discountBatch && <DiscountModal batch={discountBatch} onClose={() => setDiscountBatch(null)} />}
    </div>
  );
}
