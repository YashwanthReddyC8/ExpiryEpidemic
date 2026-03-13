import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { Users, Package, Truck, Copy, Calendar, CheckSquare, Square, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { dashboardApi } from '../api/dashboard';
import { suppliersApi } from '../api/suppliers';
import { stockRequestsApi } from '../api/stockRequests';
import { productsApi } from '../api/products';
import { useAuthStore } from '../store/authStore';
import ExpiryBadge from '../components/shared/ExpiryBadge';
import EmptyState from '../components/shared/EmptyState';
import { formatExpiryDate } from '../utils/expiry';

function OverviewCard({ label, value, Icon, colorClass }) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${colorClass}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export default function DistributorDashboard() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [selected, setSelected] = useState(new Set());
  const [pickupDate, setPickupDate] = useState('');
  const [retailersOpen, setRetailersOpen] = useState(true);
  const [approveQty, setApproveQty] = useState({});
  const [directShopkeeperId, setDirectShopkeeperId] = useState('');
  const [directProductId, setDirectProductId] = useState('');
  const [directQty, setDirectQty] = useState('');
  const [directItems, setDirectItems] = useState([]);

  // Redirect non-distributors
  if (user?.role !== 'distributor') return <Navigate to="/" replace />;

  const { data: distData, isLoading } = useQuery({
    queryKey: ['dashboard-distributor'],
    queryFn: dashboardApi.getDistributor,
    refetchInterval: 60_000,
  });

  const { data: retailers = [] } = useQuery({
    queryKey: ['retailers'],
    queryFn: suppliersApi.getRetailers,
  });
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: productsApi.list,
  });

  const { data: stockRequests = [] } = useQuery({
    queryKey: ['stock-requests-incoming'],
    queryFn: stockRequestsApi.listIncoming,
    refetchInterval: 15000,
  });
  const pendingRequests = stockRequests.filter((r) => r.status === 'pending');
  const approvedRequests = stockRequests.filter((r) => r.status === 'approved' || r.status === 'partially_approved');

  const pickupMutation = useMutation({
    mutationFn: () => suppliersApi.bulkPickup([...selected], pickupDate),
    onSuccess: (data) => {
      toast.success(`Pickup scheduled. ${data.notified_retailers} retailer${data.notified_retailers !== 1 ? 's' : ''} notified.`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['dashboard-distributor'] });
    },
    onError: () => toast.error('Pickup scheduling failed'),
  });

  const approveRequestMutation = useMutation({
    mutationFn: ({ requestId, qty }) => stockRequestsApi.approve(requestId, qty),
    onSuccess: (res) => {
      toast.success(`Request ${res.status.replace('_', ' ')} (${res.allocated_quantity}/${res.requested_quantity})`);
      qc.invalidateQueries({ queryKey: ['stock-requests-incoming'] });
      qc.invalidateQueries({ queryKey: ['dashboard-distributor'] });
    },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Approve failed'),
  });

  const rejectRequestMutation = useMutation({
    mutationFn: (requestId) => stockRequestsApi.reject(requestId),
    onSuccess: () => {
      toast.success('Request rejected');
      qc.invalidateQueries({ queryKey: ['stock-requests-incoming'] });
    },
    onError: () => toast.error('Reject failed'),
  });

  const downloadInvoice = async (requestId, qty) => {
    try {
      // Auto-approve with given quantity; skip if already approved (409)
      try {
        await stockRequestsApi.approve(requestId, qty ?? null);
      } catch (approveErr) {
        if (approveErr?.response?.status !== 409) throw approveErr;
      }
      const res = await stockRequestsApi.generateInvoicePdf(requestId);
      const invoiceNo = res.headers?.['content-disposition']?.match(/filename="?([^"]+)"?/)?.[1]
        || `EG-REQ-invoice.pdf`;
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = invoiceNo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Request approved & invoice PDF downloaded');
      qc.invalidateQueries({ queryKey: ['stock-requests-incoming'] });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to generate invoice');
    }
  };

  const addDirectItem = () => {
    const qty = Number(directQty);
    const product = products.find((p) => p.id === directProductId);
    if (!product) {
      toast.error('Select a product');
      return;
    }
    if (!product.sku) {
      toast.error('Selected product has no SKU');
      return;
    }
    if (!qty || qty <= 0) {
      toast.error('Enter valid quantity');
      return;
    }

    setDirectItems((prev) => [...prev, {
      supplier_sku: product.sku,
      product_name: product.name,
      quantity: qty,
    }]);
    setDirectProductId('');
    setDirectQty('');
  };

  const generateDirectInvoice = async () => {
    if (!directShopkeeperId) {
      toast.error('Select a retailer');
      return;
    }
    if (directItems.length === 0) {
      toast.error('Add at least one item');
      return;
    }

    try {
      const res = await stockRequestsApi.generateDirectInvoice({
        shopkeeper_id: directShopkeeperId,
        items: directItems.map((i) => ({ supplier_sku: i.supplier_sku, quantity: i.quantity })),
      });

      const pdfResponse = await stockRequestsApi.downloadDirectInvoicePdf(res.invoice.invoice_id);
      const blob = new Blob([pdfResponse.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${res.invoice.invoice_no}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success('Direct invoice generated and downloaded');
      setDirectItems([]);
      setDirectShopkeeperId('');
      qc.invalidateQueries({ queryKey: ['batches'] });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to generate direct invoice');
    }
  };

  const atRiskBatches = distData?.at_risk_batches ?? [];
  const pendingPickups = atRiskBatches.filter((b) => b.status === 'pickup_scheduled').length;

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === atRiskBatches.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(atRiskBatches.map((b) => b.id)));
    }
  };

  const inviteUrl = `${window.location.origin}/invite/${user?.id}`;
  const copyInvite = () => { navigator.clipboard.writeText(inviteUrl); toast.success('Invite link copied!'); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Distributor Network</h1>
        <p className="text-sm text-gray-500">Manage your linked retailers and schedule pickups</p>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <OverviewCard label="Linked retailers"    value={retailers.length}                  Icon={Users}   colorClass="bg-primary-500" />
        <OverviewCard label="At-risk batches"     value={atRiskBatches.length}             Icon={Package} colorClass="bg-orange-500" />
        <OverviewCard label="Pickup scheduled"    value={pendingPickups}                   Icon={Truck}   colorClass="bg-purple-500" />
      </div>

      {/* Invite link */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Connect your retailers</h2>
        <p className="text-xs text-gray-400 mb-3">Share this link — retailers who join via it are automatically linked to your account.</p>
        <div className="flex gap-2">
          <input readOnly value={inviteUrl} className="input flex-1 bg-gray-50 font-mono text-xs" />
          <button onClick={copyInvite} className="btn-secondary flex items-center gap-1.5 flex-shrink-0">
            <Copy size={14} /> Copy
          </button>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Generate direct supplier invoice (no request)</h2>
        <p className="text-xs text-gray-500">Use this when retailer confirms products/qty by call. Download JSON invoice and share it for shop upload.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select className="select" value={directShopkeeperId} onChange={(e) => setDirectShopkeeperId(e.target.value)}>
            <option value="">Select retailer</option>
            {retailers.map((r) => <option key={r.id} value={r.id}>{r.shop_name || r.name}</option>)}
          </select>
          <select className="select" value={directProductId} onChange={(e) => setDirectProductId(e.target.value)}>
            <option value="">Select product</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>)}
          </select>
          <div className="flex gap-2">
            <input className="input" type="number" min="1" placeholder="Qty" value={directQty} onChange={(e) => setDirectQty(e.target.value)} />
            <button className="btn-secondary" onClick={addDirectItem}>Add</button>
          </div>
        </div>

        {directItems.length > 0 && (
          <div className="rounded-lg border border-gray-100">
            {directItems.map((item, idx) => (
              <div key={`${item.supplier_sku}-${idx}`} className="px-3 py-2 text-xs border-b border-gray-100 last:border-b-0 flex items-center justify-between">
                <span>{item.product_name} ({item.supplier_sku})</span>
                <span>Qty: {item.quantity}</span>
              </div>
            ))}
          </div>
        )}

        <button className="btn-primary" onClick={generateDirectInvoice}>Generate Direct Invoice File</button>
      </div>

      {/* At-risk batch table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Stock requests from shopkeepers</h2>
          <span className="text-xs text-gray-400">{pendingRequests.length} pending</span>
        </div>
        {pendingRequests.length === 0 ? (
          <div className="px-5 py-6 text-sm text-gray-400">No pending stock requests.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pendingRequests.map((req) => (
              <div key={req.id} className="px-5 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{req.product_name} ({req.supplier_sku})</p>
                  <p className="text-xs text-gray-500">{req.shop_name} · {req.shopkeeper_name}</p>
                  <p className="text-xs text-gray-500">Requested: {req.requested_quantity} · Available: {req.available_quantity}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max={req.requested_quantity}
                    className="input w-24"
                    value={approveQty[req.id] ?? req.requested_quantity}
                    onChange={(e) => setApproveQty((prev) => ({ ...prev, [req.id]: Number(e.target.value) }))}
                  />
                  <button
                    className="btn-primary"
                    onClick={() => downloadInvoice(req.id, approveQty[req.id] ?? req.requested_quantity)}
                    disabled={approveRequestMutation.isPending}
                  >
                    Generate Invoice
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => rejectRequestMutation.mutate(req.id)}
                    disabled={rejectRequestMutation.isPending}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Approved requests (ready to invoice)</h2>
          <span className="text-xs text-gray-400">{approvedRequests.length} approved</span>
        </div>
        {approvedRequests.length === 0 ? (
          <div className="px-5 py-6 text-sm text-gray-400">No approved requests yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {approvedRequests.map((req) => (
              <div key={req.id} className="px-5 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{req.product_name} ({req.supplier_sku})</p>
                  <p className="text-xs text-gray-500">{req.shop_name} · {req.shopkeeper_name}</p>
                  <p className="text-xs text-gray-500">Allocated: {req.allocated_quantity} · Unit price: Rs {req.quoted_unit_price ?? 0}</p>
                </div>
                <button className="btn-secondary" onClick={() => downloadInvoice(req.id)}>
                  Generate Invoice File
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* At-risk batch table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">At-risk batches</h2>
          <span className="text-xs text-gray-400">{atRiskBatches.length} batch{atRiskBatches.length !== 1 ? 'es' : ''} across all retailers</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3">
                  <button onClick={toggleAll} className="text-gray-400 hover:text-gray-700">
                    {selected.size === atRiskBatches.length && atRiskBatches.length > 0
                      ? <CheckSquare size={15} /> : <Square size={15} />}
                  </button>
                </th>
                {['Retailer', 'Shop', 'Product', 'Batch', 'Expiry', 'Qty', 'Days Left'].map((h) => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">Loading…</td></tr>
              )}
              {!isLoading && atRiskBatches.length === 0 && (
                <tr><td colSpan={8}>
                  <EmptyState title="No at-risk batches" description="All linked retailers have everything under control!" icon={Package} />
                </td></tr>
              )}
              {atRiskBatches.map((batch) => (
                <tr key={batch.id} className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors ${selected.has(batch.id) ? 'bg-primary-50' : ''}`}>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleRow(batch.id)} className={`${selected.has(batch.id) ? 'text-primary-600' : 'text-gray-300'} hover:text-primary-500`}>
                      {selected.has(batch.id) ? <CheckSquare size={15} /> : <Square size={15} />}
                    </button>
                  </td>
                  <td className="px-3 py-3 font-medium text-gray-900 text-xs max-w-[100px] truncate">{batch.owner_name ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-500 text-xs max-w-[100px] truncate">{batch.shop_name ?? '—'}</td>
                  <td className="px-3 py-3 font-medium text-gray-900 text-xs max-w-[120px] truncate">{batch.product_name}</td>
                  <td className="px-3 py-3 text-gray-500 font-mono text-xs">{batch.batch_number ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">{formatExpiryDate(batch.expiry_date)}</td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{batch.quantity}</td>
                  <td className="px-3 py-3">
                    <ExpiryBadge days={batch.days_to_expiry ?? 0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bulk pickup bar */}
        {selected.size > 0 && (
          <div className="px-5 py-3 bg-primary-50 border-t border-primary-100 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-primary-700">{selected.size} batch{selected.size !== 1 ? 'es' : ''} selected</span>
            <div className="flex items-center gap-2 flex-1 min-w-40">
              <Calendar size={14} className="text-gray-400 flex-shrink-0" />
              <input
                type="date"
                className="input py-1 text-sm"
                value={pickupDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setPickupDate(e.target.value)}
              />
            </div>
            <button
              onClick={() => pickupMutation.mutate()}
              disabled={!pickupDate || pickupMutation.isPending}
              className="btn-primary flex-shrink-0 disabled:opacity-50"
            >
              {pickupMutation.isPending ? 'Scheduling…' : 'Schedule Pickup & Notify Retailers'}
            </button>
          </div>
        )}
      </div>

      {/* Retailer list (collapsible) */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setRetailersOpen(!retailersOpen)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-sm font-semibold text-gray-700">Linked retailers ({retailers.length})</h2>
          {retailersOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>

        {retailersOpen && (
          <div className="border-t border-gray-100 divide-y divide-gray-100">
            {retailers.length === 0 ? (
              <div className="px-5 py-6 text-sm text-gray-400 text-center">No retailers linked yet. Share your invite link!</div>
            ) : retailers.map((r) => (
              <div key={r.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{r.shop_name}</p>
                  <p className="text-xs text-gray-500">{r.name} · {r.phone ?? '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-orange-100 text-orange-600 font-medium px-2 py-0.5 rounded-full">
                    {atRiskBatches.filter((b) => b.owner_id === r.id).length} at risk
                  </span>
                  <span className="text-xs text-gray-400 capitalize">{r.shop_type}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
