import { useEffect, useState } from 'react';
import { X, MessageCircle, Download, Copy, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { returnsApi } from '../api/returns';

export default function ReturnMemoModal({ batch, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    returnsApi.generate(batch.id)
      .then(setData)
      .catch(() => toast.error('Could not generate return memo'))
      .finally(() => setLoading(false));
  }, [batch.id]);

  const copy = () => {
    if (!data?.whatsapp_message) return;
    navigator.clipboard.writeText(data.whatsapp_message);
    toast.success('Message copied!');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Return Memo</h2>
            <p className="text-xs text-gray-500">{batch.product_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
          ) : !data ? (
            <p className="text-sm text-red-500 text-center">Failed to generate return memo.</p>
          ) : (
            <>
              {/* Supplier info */}
              {data.supplier_name && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <p className="font-medium text-gray-800">{data.supplier_name}</p>
                  {data.supplier_whatsapp && (
                    <p className="text-gray-500 text-xs mt-0.5">📞 {data.supplier_whatsapp}</p>
                  )}
                </div>
              )}

              {/* WhatsApp message */}
              <div>
                <label className="label">WhatsApp message</label>
                <textarea
                  readOnly
                  rows={10}
                  className="input font-mono text-xs resize-none bg-gray-50"
                  value={data.whatsapp_message}
                />
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                {data.whatsapp_url && (
                  <a
                    href={data.whatsapp_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary flex items-center justify-center gap-2"
                  >
                    <MessageCircle size={16} /> Send via WhatsApp
                  </a>
                )}
                <a
                  href={returnsApi.getPdfUrl(batch.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary flex items-center justify-center gap-2"
                >
                  <Download size={16} /> Download PDF
                </a>
                <button onClick={copy} className="btn-ghost flex items-center justify-center gap-2">
                  <Copy size={15} /> Copy message
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
