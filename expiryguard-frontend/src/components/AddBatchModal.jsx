import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Search, Barcode, Upload, FileImage, AlertTriangle, CheckCircle, Lock, Pencil, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { batchesApi } from '../api/batches';
import { productsApi } from '../api/products';
import { suppliersApi } from '../api/suppliers';
import { ocrApi } from '../api/ocr';

const TABS = ['Manual', 'Scan Barcode', 'Upload Invoice'];

// ── Confidence helpers ────────────────────────────────────────

function confClass(score) {
  if (!score && score !== 0) return 'bg-gray-50 border-gray-200';
  if (score >= 0.85) return 'bg-green-50 border-green-300';
  if (score >= 0.60) return 'bg-amber-50 border-amber-300';
  return 'bg-red-50 border-red-300';
}

function ConfIcon({ score }) {
  if (!score && score !== 0) return null;
  if (score >= 0.85) return <Lock size={10} className="text-green-500 flex-shrink-0" />;
  if (score >= 0.60) return <Pencil size={10} className="text-amber-500 flex-shrink-0" />;
  return <AlertTriangle size={10} className="text-red-500 flex-shrink-0" />;
}

function FieldCell({ field, confidence, value, onChange, type = 'text', readOnly }) {
  const isReadOnly = confidence >= 0.85 || readOnly;
  return (
    <td className={`px-2 py-1.5 border-r border-gray-100`}>
      <div className={`flex items-center gap-1 rounded border px-1.5 py-1 ${confClass(confidence)}`}>
        <ConfIcon score={confidence} />
        <input
          type={type}
          className="w-full bg-transparent text-xs outline-none min-w-0"
          value={value ?? ''}
          readOnly={isReadOnly}
          onChange={(e) => onChange(e.target.value)}
          placeholder={confidence < 0.60 ? 'Required' : ''}
        />
      </div>
    </td>
  );
}

// ── Manual Tab ────────────────────────────────────────────────

function ManualTab({ onSuccess, prefillName }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    product_name: prefillName || '', batch_number: '', expiry_date: '', quantity: '',
    purchase_price: '', purchase_date: new Date().toISOString().split('T')[0],
    supplier_name: '',
  });

  const { data: products } = useQuery({ queryKey: ['products'], queryFn: productsApi.list });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list });

  const mutation = useMutation({
    mutationFn: batchesApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['batches'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Batch added!');
      onSuccess();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to add batch'),
  });

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate({ ...form, quantity: Number(form.quantity), purchase_price: Number(form.purchase_price) });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Product name *</label>
          <input list="product-list" className="input" required placeholder="Paracetamol 500mg" value={form.product_name} onChange={set('product_name')} />
          <datalist id="product-list">{(products ?? []).map((p) => <option key={p.id} value={p.name} />)}</datalist>
        </div>
        <div>
          <label className="label">Batch number</label>
          <input className="input" placeholder="PCT-2024-001" value={form.batch_number} onChange={set('batch_number')} />
        </div>
        <div>
          <label className="label">Expiry date *</label>
          <input type="date" className="input" required value={form.expiry_date} onChange={set('expiry_date')} />
        </div>
        <div>
          <label className="label">Quantity *</label>
          <input type="number" className="input" required min="1" placeholder="100" value={form.quantity} onChange={set('quantity')} />
        </div>
        <div>
          <label className="label">Purchase price ₹ *</label>
          <input type="number" step="0.01" className="input" required placeholder="50.00" value={form.purchase_price} onChange={set('purchase_price')} />
        </div>
        <div>
          <label className="label">Purchase date</label>
          <input type="date" className="input" value={form.purchase_date} onChange={set('purchase_date')} />
        </div>
        <div>
          <label className="label">Supplier</label>
          <input list="supplier-list" className="input" placeholder="Ravi Traders" value={form.supplier_name} onChange={set('supplier_name')} />
          <datalist id="supplier-list">{(suppliers ?? []).map((s) => <option key={s.id} value={s.name} />)}</datalist>
        </div>
      </div>
      <button type="submit" disabled={mutation.isPending} className="btn-primary w-full mt-2">
        {mutation.isPending ? 'Adding…' : 'Add Batch'}
      </button>
    </form>
  );
}

// ── Barcode Tab ───────────────────────────────────────────────

function BarcodeTab({ onFilled }) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const data = await productsApi.lookupBarcode(code.trim());
      setResult(data);
      if (!data.found) toast.error('Not found in catalog or Open Food Facts');
    } catch { toast.error('Lookup failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="Enter barcode number…" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookup()} />
        <button onClick={lookup} disabled={loading} className="btn-primary px-5">{loading ? '…' : 'Look up'}</button>
      </div>
      {result?.found && (
        <div className="card p-4 bg-emerald-50 border border-emerald-200 space-y-2">
          <p className="font-semibold text-gray-900">{result.product_name}</p>
          {result.brand && <p className="text-sm text-gray-500">Brand: {result.brand}</p>}
          {result.category && <p className="text-sm text-gray-500">Category: {result.category}</p>}
          <button className="btn-primary mt-2" onClick={() => onFilled(result.product_name)}>
            Use this → fill manual form
          </button>
        </div>
      )}
      <p className="text-xs text-gray-400 text-center">Type the barcode number or scan with a USB barcode reader</p>
    </div>
  );
}

// ── Invoice Tab ───────────────────────────────────────────────

function InvoiceTab({ onSuccess }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [rows, setRows] = useState(null); // [{product_name:{value,confidence}, ...}]
  const [rawText, setRawText] = useState('');

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    setRows(null);
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const processInvoice = async () => {
    if (!file) return;
    setProcessing(true);
    try {
      const data = await ocrApi.processInvoice(file);
      setRawText(data.raw_text);
      // Initialise editable rows with OCR results
      setRows(data.items.map((item) => ({
        product_name: { value: item.product_name?.value ?? '', confidence: item.product_name?.confidence ?? 0 },
        batch_number: { value: item.batch_number?.value ?? '', confidence: item.batch_number?.confidence ?? 0 },
        expiry_date:  { value: item.expiry_date?.value ?? '', confidence: item.expiry_date?.confidence ?? 0 },
        quantity:     { value: item.quantity?.value ? String(item.quantity.value) : '', confidence: item.quantity?.confidence ?? 0 },
        purchase_price: { value: '', confidence: 0 },
      })));
      toast.success(`Extracted ${data.items.length} items in ${data.processing_time_ms}ms`);
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'OCR processing failed');
    } finally {
      setProcessing(false);
    }
  };

  const updateCell = (rowIdx, field, value) => {
    setRows((prev) => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [field]: { ...next[rowIdx][field], value } };
      return next;
    });
  };

  // Compute progress
  const allFields = rows ? rows.flatMap((r) => Object.values(r)) : [];
  const highConf = allFields.filter((f) => f.confidence >= 0.85).length;
  const total = allFields.length;
  const emptyRequired = rows ? rows.filter((r) =>
    !r.product_name.value || !r.expiry_date.value || !r.quantity.value || !r.purchase_price.value
  ).length : 0;

  const bulkMutation = useMutation({
    mutationFn: (payloads) => batchesApi.bulkCreate(payloads),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['batches'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`${data.inserted} batches saved${data.skipped ? `, ${data.skipped} skipped (duplicates)` : ''}`);
      onSuccess();
    },
    onError: () => toast.error('Bulk save failed'),
  });

  const saveAll = () => {
    const payloads = rows.map((r) => ({
      product_name: r.product_name.value,
      batch_number: r.batch_number.value || undefined,
      expiry_date: r.expiry_date.value,
      quantity: Number(r.quantity.value),
      purchase_price: Number(r.purchase_price.value) || 0,
      purchase_date: new Date().toISOString().split('T')[0],
    }));
    bulkMutation.mutate(payloads);
  };

  // ── Upload zone ──
  if (!rows) {
    return (
      <div className="space-y-4">
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
            ${dragOver ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
          {file ? (
            <div className="space-y-2">
              {preview
                ? <img src={preview} alt="preview" className="max-h-40 mx-auto rounded-lg object-contain" />
                : <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center mx-auto"><FileImage className="w-8 h-8 text-gray-400" /></div>
              }
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
              <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto">
                <Upload className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">Drop an invoice image here</p>
              <p className="text-xs text-gray-400">or click to browse — JPG, PNG, PDF supported</p>
            </div>
          )}
        </div>

        {file && (
          <button onClick={processInvoice} disabled={processing} className="btn-primary w-full flex items-center justify-center gap-2">
            {processing ? <><Loader2 className="animate-spin w-4 h-4" /> Analysing invoice…</> : 'Process Invoice'}
          </button>
        )}
      </div>
    );
  }

  // ── Confidence preview table ──
  const pctFilled = total > 0 ? Math.round((highConf / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="flex justify-between text-xs text-gray-600 mb-1.5">
          <span>AI filled <strong>{highConf}</strong> of <strong>{total}</strong> fields</span>
          {emptyRequired > 0 && <span className="text-red-500 font-medium">{emptyRequired} required cells empty</span>}
          {emptyRequired === 0 && <span className="text-emerald-600 font-medium">✓ Ready to save</span>}
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pctFilled}%` }} />
        </div>
        <div className="flex gap-3 mt-1.5 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block"/> High confidence (read-only)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/> Review needed</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block"/> Must fill</span>
        </div>
      </div>

      {/* Editable table */}
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Product Name', 'Batch No.', 'Expiry Date', 'Qty', '₹ Price', 'Confidence'].map((h) => (
                <th key={h} className="px-2 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const avgConf = Object.values(row).reduce((s, f) => s + (f.confidence || 0), 0) / Object.keys(row).length;
              return (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <FieldCell field="product_name" confidence={row.product_name.confidence} value={row.product_name.value} onChange={(v) => updateCell(i, 'product_name', v)} />
                  <FieldCell field="batch_number"  confidence={row.batch_number.confidence}  value={row.batch_number.value}  onChange={(v) => updateCell(i, 'batch_number',  v)} />
                  <FieldCell field="expiry_date"   confidence={row.expiry_date.confidence}   value={row.expiry_date.value}   onChange={(v) => updateCell(i, 'expiry_date',   v)} type="date" />
                  <FieldCell field="quantity"      confidence={row.quantity.confidence}      value={row.quantity.value}      onChange={(v) => updateCell(i, 'quantity',      v)} type="number" />
                  <FieldCell field="purchase_price" confidence={row.purchase_price.confidence} value={row.purchase_price.value} onChange={(v) => updateCell(i, 'purchase_price', v)} type="number" readOnly={false} />
                  <td className="px-2 py-1.5">
                    <span className={`text-xs font-semibold ${avgConf >= 0.85 ? 'text-green-600' : avgConf >= 0.60 ? 'text-amber-600' : 'text-red-500'}`}>
                      {Math.round(avgConf * 100)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setRows(null)} className="btn-secondary flex-shrink-0">← Re-upload</button>
        <button
          onClick={saveAll}
          disabled={emptyRequired > 0 || bulkMutation.isPending}
          className="btn-primary flex-1 disabled:opacity-50"
        >
          {bulkMutation.isPending ? 'Saving…' : `Confirm & Save ${rows.length} batch${rows.length !== 1 ? 'es' : ''}`}
        </button>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────

export default function AddBatchModal({ open, onClose, initialTab = 0 }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [prefillName, setPrefillName] = useState('');

  if (!open) return null;

  const handleFilled = (name) => { setPrefillName(name); setActiveTab(0); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Add Batch</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>
        <div className="flex border-b border-gray-100">
          {TABS.map((tab, i) => (
            <button key={tab} onClick={() => setActiveTab(i)}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === i ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 0 && <ManualTab onSuccess={onClose} prefillName={prefillName} />}
          {activeTab === 1 && <BarcodeTab onFilled={handleFilled} />}
          {activeTab === 2 && <InvoiceTab onSuccess={onClose} />}
        </div>
      </div>
    </div>
  );
}
