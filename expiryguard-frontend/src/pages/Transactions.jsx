import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Receipt, Search } from 'lucide-react';
import { batchesApi } from '../api/batches';
import EmptyState from '../components/shared/EmptyState';
import SkeletonCard from '../components/shared/SkeletonCard';

const STATUS_BADGE = {
  active: 'bg-emerald-100 text-emerald-800',
  expiring_soon: 'bg-amber-100 text-amber-800',
  expired: 'bg-red-100 text-red-800',
  returned: 'bg-gray-100 text-gray-700',
  donated: 'bg-purple-100 text-purple-800',
  discounted: 'bg-blue-100 text-blue-800',
  pickup_scheduled: 'bg-orange-100 text-orange-800',
};

function generateAndPrintInvoice(batch) {
  const date = batch.created_at
    ? new Date(batch.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const expiry = batch.expiry_date
    ? new Date(batch.expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const total = (batch.quantity * batch.purchase_price).toFixed(2);
  const invoiceRef = batch.batch_number || `TXN-${batch.id?.slice(-8).toUpperCase()}`;
  // barcode encodes the invoice reference — only alphanumeric + hyphen chars safe for Code128
  const barcodeValue = invoiceRef.replace(/[^A-Z0-9\-]/gi, '').toUpperCase();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Invoice ${invoiceRef}</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; background: #fff; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 24px; }
    .brand { font-size: 22px; font-weight: 800; color: #2563eb; letter-spacing: -0.5px; }
    .brand span { color: #1a1a2e; }
    .invoice-meta { text-align: right; }
    .invoice-meta h2 { font-size: 18px; font-weight: 700; color: #374151; }
    .invoice-meta p { font-size: 13px; color: #6b7280; margin-top: 2px; }
    .details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px; }
    .detail-block h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #6b7280; margin-bottom: 6px; }
    .detail-block p { font-size: 14px; color: #1f2937; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead tr { background: #2563eb; color: #fff; }
    th { padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 600; letter-spacing: 0.4px; }
    tbody tr { border-bottom: 1px solid #e5e7eb; }
    tbody tr:hover { background: #f9fafb; }
    td { padding: 10px 14px; font-size: 13px; color: #374151; }
    .totals { margin-left: auto; width: 260px; }
    .totals .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #e5e7eb; }
    .totals .row.grand { font-size: 16px; font-weight: 700; color: #2563eb; border-bottom: none; padding-top: 10px; }
    .barcode-section { margin: 28px 0; text-align: center; }
    .barcode-section p { font-size: 11px; color: #9ca3af; margin-top: 6px; font-family: monospace; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
    .print-btn { display: inline-flex; align-items: center; gap: 8px; margin-top: 24px; padding: 10px 24px;
      background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600;
      cursor: pointer; }
    @media print { .print-btn { display: none; } body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Expiry<span>Guard</span></div>
      <p style="font-size:12px;color:#6b7280;margin-top:4px;">Smart Inventory Management</p>
    </div>
    <div class="invoice-meta">
      <h2>PURCHASE RECEIPT</h2>
      <p>Ref: ${invoiceRef}</p>
      <p>Date: ${date}</p>
    </div>
  </div>

  <div class="details">
    <div class="detail-block">
      <h3>Product</h3>
      <p style="font-weight:600;font-size:16px;">${batch.product_name}</p>
      ${batch.supplier_name ? `<p style="color:#6b7280;font-size:13px;margin-top:4px;">Supplier: ${batch.supplier_name}</p>` : ''}
    </div>
    <div class="detail-block">
      <h3>Batch Details</h3>
      <p>Batch #: <strong>${batch.batch_number || '—'}</strong></p>
      <p style="margin-top:4px;">Expiry: <strong>${expiry}</strong></p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th>Batch #</th>
        <th>Quantity</th>
        <th>Unit Price</th>
        <th>Expiry Date</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${batch.product_name}</td>
        <td>${batch.batch_number || '—'}</td>
        <td>${batch.quantity}</td>
        <td>₹${Number(batch.purchase_price).toFixed(2)}</td>
        <td>${expiry}</td>
        <td><strong>₹${total}</strong></td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>₹${total}</span></div>
    <div class="row grand"><span>Total</span><span>₹${total}</span></div>
  </div>

  <div class="barcode-section">
    <svg id="inv-barcode"></svg>
    <p>${barcodeValue}</p>
  </div>

  <button class="print-btn" onclick="window.print()">
    🖨 Print / Save as PDF
  </button>

  <div class="footer">
    Generated by ExpiryGuard &bull; ${new Date().toLocaleString('en-IN')}
  </div>

  <script>
    window.addEventListener('load', function() {
      try {
        JsBarcode('#inv-barcode', '${barcodeValue}', {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: false,
          margin: 10,
          lineColor: '#1a1a2e',
        });
      } catch(e) {}
    });
  <\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
}

export default function Transactions() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const LIMIT = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['batches', { page, limit: LIMIT }],
    queryFn: () => batchesApi.list({ page, limit: LIMIT }),
    keepPreviousData: true,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  const filtered = search.trim()
    ? items.filter(
        (b) =>
          b.product_name?.toLowerCase().includes(search.toLowerCase()) ||
          b.batch_number?.toLowerCase().includes(search.toLowerCase()) ||
          b.supplier_name?.toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Receipt size={24} className="text-blue-600" />
            Transactions
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">All stock additions and purchases</p>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 w-60"
            placeholder="Search product, batch…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs text-gray-500 mb-1">Total transactions</p>
          <p className="text-2xl font-bold text-gray-900">{total}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 mb-1">Total value (page)</p>
          <p className="text-2xl font-bold text-blue-600">
            ₹{items.reduce((s, b) => s + b.quantity * b.purchase_price, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 mb-1">Total units (page)</p>
          <p className="text-2xl font-bold text-gray-900">
            {items.reduce((s, b) => s + b.quantity, 0).toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Product</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Batch #</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600 text-xs uppercase tracking-wide">Qty</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600 text-xs uppercase tracking-wide">Unit Price</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600 text-xs uppercase tracking-wide">Total</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Supplier</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Expiry</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600 text-xs uppercase tracking-wide">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center text-gray-400">
                    No transactions found
                  </td>
                </tr>
              )}
              {!isLoading &&
                filtered.map((batch) => {
                  const created = batch.created_at
                    ? new Date(batch.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—';
                  const expiry = batch.expiry_date
                    ? new Date(batch.expiry_date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—';
                  const total = (batch.quantity * batch.purchase_price).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  });
                  const badgeCls = STATUS_BADGE[batch.status] ?? 'bg-gray-100 text-gray-700';

                  return (
                    <tr key={batch.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{created}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{batch.product_name}</td>
                      <td className="px-4 py-3 font-mono text-gray-600 text-xs">{batch.batch_number || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{batch.quantity}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">₹{Number(batch.purchase_price).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">₹{total}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-[120px] truncate">{batch.supplier_name || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">{expiry}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeCls}`}>
                          {batch.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => generateAndPrintInvoice(batch)}
                          title="Download / Print Invoice"
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                        >
                          <Download size={13} />
                          Invoice
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages} &bull; {total} total transactions
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
