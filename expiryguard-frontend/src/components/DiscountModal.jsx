import { useEffect, useState, useRef } from 'react';
import { X, Printer, MessageCircle, Copy, Loader2, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { batchesApi } from '../api/batches';
import { useAuthStore } from '../store/authStore';
import { formatExpiryDate, formatINR } from '../utils/expiry';

// ── Print label (injected into a new window) ──────────────────
function printPriceLabel({ shopName, productName, originalPrice, salePrice, expiryDate }) {
  const win = window.open('', '_blank', 'width=400,height=500');
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Price Label</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        body { margin: 0; padding: 0; font-family: Inter, sans-serif; background: #fff; }
        .label {
          width: 380px; margin: 20px auto; padding: 24px;
          border: 3px solid #1a1a2e; border-radius: 16px;
          text-align: center; position: relative;
        }
        .shop { font-size: 13px; font-weight: 700; color: #4F46E5; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 16px; }
        .product { font-size: 17px; font-weight: 700; color: #1a1a2e; margin-bottom: 20px; }
        .mrp { font-size: 20px; color: #6b7280; text-decoration: line-through; text-decoration-color: #ef4444; }
        .offer-label { font-size: 11px; font-weight: 700; color: #666; letter-spacing: 0.1em; text-transform: uppercase; margin-top: 12px; }
        .offer-price { font-size: 52px; font-weight: 900; color: #ef4444; line-height: 1; margin: 4px 0 16px; }
        .expiry { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
        .limited { font-size: 11px; font-weight: 600; color: #f97316; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 50px; padding: 3px 12px; display: inline-block; margin: 8px 0; }
        .valid { font-size: 10px; color: #9ca3af; margin-top: 16px; border-top: 1px dashed #e5e7eb; padding-top: 12px; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div class="label">
        <div class="shop">${shopName}</div>
        <div class="product">${productName}</div>
        <div class="mrp">MRP ₹${originalPrice}</div>
        <div class="offer-label">OFFER PRICE</div>
        <div class="offer-price">₹${salePrice}</div>
        <div class="expiry">Best before: ${expiryDate}</div>
        <div class="limited">Limited stock available</div>
        <div class="valid">Valid while stock lasts</div>
      </div>
      <div class="no-print" style="text-align:center;margin-top:16px;">
        <button onclick="window.print()" style="background:#4F46E5;color:#fff;border:none;border-radius:8px;padding:10px 28px;font-size:14px;font-weight:600;cursor:pointer;">
          🖨 Print Label
        </button>
      </div>
    </body>
    </html>
  `);
  win.document.close();
}

export default function DiscountModal({ batch, onClose }) {
  const { user } = useAuthStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [discount, setDiscount] = useState(null); // controlled by slider
  const [showBroadcast, setShowBroadcast] = useState(false);

  useEffect(() => {
    batchesApi.discountSuggestion(batch.id)
      .then((d) => { setData(d); setDiscount(d.suggested_discount_pct); })
      .catch(() => toast.error('Could not load suggestion'))
      .finally(() => setLoading(false));
  }, [batch.id]);

  const purchasePrice = batch.purchase_price ?? data?.original_price ?? 0;
  const quantity = batch.quantity ?? 0;
  const saleprice = discount != null ? +(purchasePrice * (1 - discount / 100)).toFixed(2) : 0;
  const recovery = +(quantity * saleprice).toFixed(2);
  const fullLoss = +(quantity * purchasePrice).toFixed(2);
  const saving = +(recovery).toFixed(2);
  const expiryFormatted = formatExpiryDate(batch.expiry_date);

  const broadcastMsg = `Hi! Flash sale at ${user?.shop_name ?? 'our store'}:\n*${batch.product_name}* now at only ₹${saleprice} (was ₹${purchasePrice})\nBest before: ${expiryFormatted}. Limited stock!\nVisit us soon! 🎉`;

  const copyBroadcast = () => {
    navigator.clipboard.writeText(broadcastMsg);
    toast.success('Copied!');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Smart Discount</h2>
            <p className="text-xs text-gray-400">{batch.product_name} · {batch.batch_number ?? 'No batch no.'} · {expiryFormatted}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary-400" /></div>
          ) : (
            <>
              {/* AI suggestion card */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-indigo-500 uppercase tracking-wide mb-0.5">AI Recommendation</p>
                    <p className="text-2xl font-bold text-indigo-700">{data?.suggested_discount_pct}% discount</p>
                    <p className="text-xs text-indigo-400 mt-1 max-w-xs leading-relaxed">{data?.reasoning}</p>
                  </div>
                  <Tag className="text-indigo-400 flex-shrink-0 mt-1" size={22} />
                </div>
                <div className="flex gap-4 mt-3 text-sm">
                  <span className="text-gray-400 line-through">₹{purchasePrice}</span>
                  <span className="text-emerald-600 font-bold text-lg">₹{saleprice}</span>
                </div>
              </div>

              {/* Override slider */}
              <div>
                <div className="flex justify-between mb-2">
                  <label className="label mb-0">Adjust discount</label>
                  <span className="text-sm font-bold text-primary-600">{discount}%</span>
                </div>
                <input
                  type="range" min={10} max={70} step={1}
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>10%</span><span>70%</span>
                </div>
              </div>

              {/* Live recovery preview */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Sale price</span>
                  <span className="font-semibold text-gray-800">₹{saleprice} per unit</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Est. recovery ({quantity} units)</span>
                  <span className="font-semibold text-emerald-600">{formatINR(recovery)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2">
                  <span className="text-gray-500">vs full loss if unsold</span>
                  <span className="font-semibold text-red-400">{formatINR(fullLoss)}</span>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center text-xs font-semibold text-emerald-700 mt-1">
                  💚 You recover {formatINR(saving)} instead of losing {formatINR(fullLoss)}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => printPriceLabel({
                    shopName: user?.shop_name ?? 'My Store',
                    productName: batch.product_name,
                    originalPrice: purchasePrice,
                    salePrice: saleprice,
                    expiryDate: expiryFormatted,
                  })}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  <Printer size={15} /> Generate Price Label
                </button>
                <button onClick={() => setShowBroadcast(!showBroadcast)} className="btn-secondary flex-1 flex items-center justify-center gap-2">
                  <MessageCircle size={15} /> Broadcast
                </button>
              </div>

              {/* Broadcast panel */}
              {showBroadcast && (
                <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-700">WhatsApp broadcast message</p>
                  <textarea readOnly rows={6} className="input text-xs font-mono resize-none bg-white" value={broadcastMsg} />
                  <button onClick={copyBroadcast} className="btn-secondary w-full flex items-center justify-center gap-2">
                    <Copy size={14} /> Copy message
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
