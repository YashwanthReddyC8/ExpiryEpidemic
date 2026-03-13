import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Search, Barcode, Upload, FileImage, AlertTriangle, CheckCircle, Lock, Pencil, Loader2, Camera } from 'lucide-react';
import toast from 'react-hot-toast';
import { batchesApi } from '../api/batches';
import { productsApi } from '../api/products';
import { suppliersApi } from '../api/suppliers';
import { ocrApi } from '../api/ocr';
import { getSentRequests } from '../api/network';
import { stockRequestsApi } from '../api/stockRequests';
import { useAuthStore } from '../store/authStore';
import BarcodeScanner from './BarcodeScanner';

const TABS = ['Manual', 'Scan Barcode', 'Upload Invoice'];

function extractDirectInvoiceCode(text = '') {
  if (!text) return null;
  const normalized = text.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-');
  const withPrefix = normalized.match(/EG-DIR-[A-Z0-9]{8,}/);
  if (withPrefix) return withPrefix[0];
  const withoutPrefix = normalized.match(/DIR-[A-Z0-9]{8,}/);
  return withoutPrefix ? `EG-${withoutPrefix[0]}` : null;
}

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

function ManualTab({ onSuccess, prefillName, onOpenInvoiceTab }) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isDistributor = user?.role === 'distributor';
  const isShopkeeper = user?.role === 'shopkeeper';
  const [form, setForm] = useState({
    product_id: '', product_name: prefillName || '', batch_number: '', expiry_date: '', quantity: '',
    purchase_price: '', purchase_date: new Date().toISOString().split('T')[0],
    supplier_name: '', distributor_id: '',
  });

  const { data: products } = useQuery({ queryKey: ['products'], queryFn: productsApi.list });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list });
  const { data: sentRequests = [] } = useQuery({
    queryKey: ['network_sent'],
    queryFn: getSentRequests,
    enabled: isShopkeeper,
  });
  const connectedDistributors = sentRequests.filter((r) => r.status === 'accepted');
  const selectedProduct = (products ?? []).find((p) => p.id === form.product_id);

  const { data: quoteData } = useQuery({
    queryKey: ['stock-quote', form.distributor_id, selectedProduct?.sku],
    queryFn: () => stockRequestsApi.quote(form.distributor_id, selectedProduct.sku),
    enabled: isShopkeeper && !!form.distributor_id && !!selectedProduct?.sku,
  });

  useEffect(() => {
    if (!isShopkeeper || !quoteData) return;
    setForm((prev) => {
      if (prev.purchase_price) return prev;
      return { ...prev, purchase_price: String(quoteData.quoted_unit_price ?? '') };
    });
  }, [isShopkeeper, quoteData]);

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

  useEffect(() => {
    if (!prefillName || !products?.length) return;
    const match = products.find((p) => p.name?.toLowerCase() === prefillName.toLowerCase());
    if (match) {
      setForm((prev) => ({ ...prev, product_id: match.id, product_name: match.name }));
    }
  }, [prefillName, products]);

  const handleProductChange = (e) => {
    const selectedId = e.target.value;
    const selected = (products ?? []).find((p) => p.id === selectedId);
    setForm((prev) => ({
      ...prev,
      product_id: selectedId,
      product_name: selected?.name ?? '',
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const selected = (products ?? []).find((p) => p.id === form.product_id);
    if (!selected) {
      toast.error('Please select a product from the list');
      return;
    }

    const selectedDistributor = connectedDistributors.find((d) => d.to_id === form.distributor_id);

    mutation.mutate({
      ...form,
      product_id: selected.id,
      product_name: selected.name,
      supplier_id: isShopkeeper ? form.distributor_id || undefined : undefined,
      supplier_name: isShopkeeper ? (form.supplier_name || '') : (isDistributor ? '' : form.supplier_name),
      quantity: Number(form.quantity),
      purchase_price: isShopkeeper ? 0 : Number(form.purchase_price),
      batch_number: isShopkeeper ? undefined : form.batch_number,
      purchase_date: isShopkeeper ? new Date().toISOString().split('T')[0] : form.purchase_date,
      expiry_date: isShopkeeper ? '2099-12-31' : form.expiry_date,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Product *</label>
          <select className="select" required value={form.product_id} onChange={handleProductChange}>
            <option value="">Select product</option>
            {(products ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Quantity *</label>
          <input type="number" className="input" required min="1" placeholder="100" value={form.quantity} onChange={set('quantity')} />
        </div>
        {isShopkeeper ? (
          <div className="col-span-2">
            <label className="label">Supplier *</label>
            <select className="select" required value={form.supplier_name} onChange={set('supplier_name')}>
              <option value="">Select supplier</option>
              {(suppliers ?? []).map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div>
              <label className="label">Batch number</label>
              <input className="input" placeholder="PCT-2024-001" value={form.batch_number} onChange={set('batch_number')} />
            </div>
            <div>
              <label className="label">Expiry date *</label>
              <input type="date" className="input" required value={form.expiry_date} onChange={set('expiry_date')} />
            </div>
            <div>
              <label className="label">Purchase price ₹ *</label>
              <input type="number" step="0.01" className="input" required placeholder="50.00" value={form.purchase_price} onChange={set('purchase_price')} />
            </div>
            <div>
              <label className="label">Purchase date</label>
              <input type="date" className="input" value={form.purchase_date} onChange={set('purchase_date')} />
            </div>
            {!isDistributor && (
              <div>
                <label className="label">Supplier / Distributor</label>
                <input list="supplier-list" className="input" placeholder="Ravi Traders" value={form.supplier_name} onChange={set('supplier_name')} />
                <datalist id="supplier-list">{(suppliers ?? []).map((s) => <option key={s.id} value={s.name} />)}</datalist>
              </div>
            )}
          </>
        )}
      </div>
      <button type="submit" disabled={mutation.isPending} className="btn-primary w-full mt-2">
        {mutation.isPending ? 'Adding…' : 'Add Batch'}
      </button>
    </form>
  );
}

// ── Quick-Add Product inline form (shown when barcode not found) ──────────────
function QuickAddProduct({ barcode, onAdded, onDismiss }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', sku: '', unit: 'pcs', category: '' });
  const [saving, setSaving] = useState(false);
  const set = (f) => (e) => setForm((prev) => ({ ...prev, [f]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.sku.trim()) return;
    setSaving(true);
    try {
      await productsApi.create({ ...form, barcode });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(`"${form.name}" added to catalog`);
      onAdded(form.name);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to add product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="card p-4 bg-amber-50 border border-amber-200 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-amber-900 text-sm">Barcode not in catalog — add it now</p>
          <p className="text-xs text-amber-700 font-mono mt-0.5">Barcode: <span className="font-bold">{barcode}</span></p>
        </div>
        <button type="button" onClick={onDismiss} className="text-amber-400 hover:text-amber-600 flex-shrink-0"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="label text-amber-800">Product name *</label>
          <input className="input text-sm" required value={form.name} onChange={set('name')} placeholder="e.g. Colgate Max Fresh 150g" />
        </div>
        <div>
          <label className="label text-amber-800">SKU *</label>
          <input className="input text-sm font-mono" required value={form.sku} onChange={set('sku')} placeholder="e.g. CLG-150" />
        </div>
        <div>
          <label className="label text-amber-800">Unit</label>
          <select className="select text-sm" value={form.unit} onChange={set('unit')}>
            {['pcs', 'box', 'strip', 'kg', 'litre', 'pack'].map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label text-amber-800">Category</label>
          <input className="input text-sm" value={form.category} onChange={set('category')} placeholder="e.g. Personal Care" />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary flex-1 text-sm">
          {saving ? 'Saving…' : 'Save & use this product'}
        </button>
        <button type="button" onClick={onDismiss} className="btn-secondary px-3 text-sm">Cancel</button>
      </div>
    </form>
  );
}

// ── Barcode Tab ───────────────────────────────────────────────

function BarcodeTab({ onFilled, onImportSuccess, onOpenInvoiceTab }) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isShopkeeper = user?.role === 'shopkeeper';
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importingInvoice, setImportingInvoice] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const lastLookupRef = useRef('');

  const lookup = async (nextCode = code) => {
    const rawCode = typeof nextCode === 'string' ? nextCode : code;
    const trimmedCode = rawCode.trim();
    if (!trimmedCode) return;

    setShowQuickAdd(false);
    setLoading(true);
    try {
      const data = await productsApi.lookupBarcode(trimmedCode);
      setCode(trimmedCode);
      if (data?.source === 'direct_invoice') {
        setShowQuickAdd(false);
        setResult(data);
        if (lastLookupRef.current !== `${trimmedCode}:direct_invoice`) {
          toast('Invoice barcode detected. Importing into your shop inventory...');
          lastLookupRef.current = `${trimmedCode}:direct_invoice`;
        }
        if (isShopkeeper && data.found) {
          const invoiceNo = extractDirectInvoiceCode(data?.invoice_no || data?.barcode || trimmedCode || '');
          if (invoiceNo) {
            setImportingInvoice(true);
            try {
              const imported = await stockRequestsApi.importDirectInvoiceByCode(invoiceNo);
              qc.invalidateQueries({ queryKey: ['batches'] });
              qc.invalidateQueries({ queryKey: ['dashboard'] });
              qc.invalidateQueries({ queryKey: ['stock-requests-mine'] });
              toast.success(`Imported ${imported.inserted_batches} batch(es) from invoice ${invoiceNo}`);
              onImportSuccess();
              return;
            } catch (err) {
              // If already imported, treat as non-fatal and keep invoice card visible.
              if (err?.response?.status === 409) {
                toast('Invoice already imported');
              } else {
                toast.error(err?.response?.data?.detail || 'Invoice import failed');
              }
            } finally {
              setImportingInvoice(false);
            }
          }
        }
        return;
      }
      setResult(data);
      if (!data.found) {
        const errorKey = `${trimmedCode}:${data?.detail || 'not-found'}`;
        if (lastLookupRef.current !== errorKey) {
          lastLookupRef.current = errorKey;
        }
        setShowQuickAdd(true);
      } else {
        lastLookupRef.current = `${trimmedCode}:found`;
      }
    } catch { toast.error('Lookup failed'); }
    finally { setLoading(false); }
  };

  const importDirectInvoice = async () => {
    const invoiceNo = extractDirectInvoiceCode(result?.invoice_no || result?.barcode || code || '');
    if (!invoiceNo) {
      toast.error('Invalid invoice code');
      return;
    }

    setImportingInvoice(true);
    try {
      const imported = await stockRequestsApi.importDirectInvoiceByCode(invoiceNo);
      qc.invalidateQueries({ queryKey: ['batches'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['stock-requests-mine'] });
      toast.success(`Imported ${imported.inserted_batches} batch(es) from invoice ${invoiceNo}`);
      onImportSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Invoice import failed');
    } finally {
      setImportingInvoice(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="Enter barcode number…" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookup()} />
        <button
          type="button"
          onClick={() => setShowScanner(true)}
          className="btn-secondary px-4 flex items-center gap-2"
        >
          <Camera size={16} /> Camera
        </button>
        <button type="button" onClick={() => lookup()} disabled={loading} className="btn-primary px-5">{loading ? '…' : 'Look up'}</button>
      </div>
      {result?.found && result?.source !== 'direct_invoice' && (
        <div className="card p-4 bg-emerald-50 border border-emerald-200 space-y-2">
          <p className="font-semibold text-gray-900">{result.product_name}</p>
          {result.brand && <p className="text-sm text-gray-500">Brand: {result.brand}</p>}
          {result.category && <p className="text-sm text-gray-500">Category: {result.category}</p>}
          <button className="btn-primary mt-2" onClick={() => onFilled(result.product_name)}>
            Use this → fill manual form
          </button>
        </div>
      )}
      {result?.found && result?.source === 'direct_invoice' && (
        <div className="card p-4 bg-indigo-50 border border-indigo-200 space-y-2">
          <p className="font-semibold text-indigo-900">Invoice barcode detected</p>
          <p className="text-xs text-indigo-700 font-mono">{result.invoice_no || result.barcode || code}</p>
          {isShopkeeper ? (
            <button className="btn-primary mt-1" onClick={importDirectInvoice} disabled={importingInvoice}>
              {importingInvoice ? 'Importing…' : 'Import this invoice now'}
            </button>
          ) : (
            <p className="text-xs text-indigo-700">Only shopkeeper account can import this invoice.</p>
          )}
          <button type="button" className="btn-secondary mt-1" onClick={onOpenInvoiceTab}>
            Open Upload Invoice tab
          </button>
        </div>
      )}
      {result && !result.found && showQuickAdd && (
        <QuickAddProduct
          barcode={result.barcode || code}
          onAdded={(name) => {
            setShowQuickAdd(false);
            setResult(null);
            onFilled(name);
          }}
          onDismiss={() => setShowQuickAdd(false)}
        />
      )}
      <p className="text-xs text-gray-400 text-center">Type the barcode number, scan with camera, or use a USB barcode reader</p>
      {showScanner && (
        <BarcodeScanner
          label="Scan Product Barcode"
          onClose={() => setShowScanner(false)}
          onScan={(decoded) => {
            setShowScanner(false);
            lookup(decoded);
          }}
        />
      )}
    </div>
  );
}

// ── Invoice Tab ───────────────────────────────────────────────

function InvoiceTab({ onSuccess }) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isShopkeeper = user?.role === 'shopkeeper';
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: productsApi.list });
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [importingByCode, setImportingByCode] = useState(false);
  const [invoiceCodeInput, setInvoiceCodeInput] = useState('');
  const [rows, setRows] = useState(null); // [{product_name:{value,confidence}, ...}]
  const [rawText, setRawText] = useState('');

  const importByInvoiceCode = async () => {
    const normalized = extractDirectInvoiceCode(invoiceCodeInput || '');
    if (!normalized) {
      toast.error('Enter a valid invoice code like EG-DIR-XXXXXXXX');
      return;
    }

    setImportingByCode(true);
    try {
      const imported = await stockRequestsApi.importDirectInvoiceByCode(normalized);
      qc.invalidateQueries({ queryKey: ['batches'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['stock-requests-mine'] });
      toast.success(`Imported ${imported.inserted_batches} batch(es) from invoice ${normalized}`);
      onSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Invoice import by code failed');
    } finally {
      setImportingByCode(false);
    }
  };

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
      if (isShopkeeper && file.name.toLowerCase().endsWith('.json')) {
        const imported = await stockRequestsApi.importInvoice(file);
        qc.invalidateQueries({ queryKey: ['batches'] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
        qc.invalidateQueries({ queryKey: ['stock-requests-mine'] });
        toast.success(`Imported ${imported.inserted_batches} batch(es) from supplier invoice`);
        onSuccess();
        return;
      }

      if (isShopkeeper && file.name.toLowerCase().endsWith('.pdf')) {
        const codeFromFilename = extractDirectInvoiceCode(file.name);
        if (codeFromFilename) {
          const imported = await stockRequestsApi.importDirectInvoiceByCode(codeFromFilename);
          qc.invalidateQueries({ queryKey: ['batches'] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
          qc.invalidateQueries({ queryKey: ['stock-requests-mine'] });
          toast.success(`Imported ${imported.inserted_batches} batch(es) from invoice ${codeFromFilename}`);
          onSuccess();
          return;
        }
      }

      const data = await ocrApi.processInvoice(file);
      setRawText(data.raw_text);

      if (isShopkeeper && file.name.toLowerCase().endsWith('.pdf')) {
        const codeFromText = extractDirectInvoiceCode(data.raw_text || '');
        if (codeFromText) {
          const imported = await stockRequestsApi.importDirectInvoiceByCode(codeFromText);
          qc.invalidateQueries({ queryKey: ['batches'] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
          qc.invalidateQueries({ queryKey: ['stock-requests-mine'] });
          toast.success(`Imported ${imported.inserted_batches} batch(es) from invoice ${codeFromText}`);
          onSuccess();
          return;
        }

        toast.error('Direct invoice code not detected in PDF. Upload the original EG-DIR-*.pdf file or JSON invoice.');
        return;
      }

      // Initialise editable rows with OCR results
      setRows(data.items.map((item) => ({
        product_id: {
          value: (products ?? []).find((p) => p.name?.toLowerCase() === (item.product_name?.value ?? '').toLowerCase())?.id ?? '',
          confidence: item.product_name?.confidence ?? 0,
        },
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
    !r.product_id.value || !r.expiry_date.value || !r.quantity.value || !r.purchase_price.value
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
      product_id: r.product_id.value,
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
        {isShopkeeper && (
          <div className="card p-3 border border-indigo-200 bg-indigo-50/50 space-y-2">
            <p className="text-xs font-semibold text-indigo-900">Have a scanned invoice barcode?</p>
            <div className="flex gap-2">
              <input
                className="input flex-1 font-mono"
                placeholder="EG-DIR-XXXXXXXX"
                value={invoiceCodeInput}
                onChange={(e) => setInvoiceCodeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && importByInvoiceCode()}
              />
              <button
                type="button"
                className="btn-primary px-4"
                disabled={importingByCode || !invoiceCodeInput.trim()}
                onClick={importByInvoiceCode}
              >
                {importingByCode ? 'Importing…' : 'Import by code'}
              </button>
            </div>
            <p className="text-[11px] text-indigo-700">Example: EG-DIR-B7212D1D</p>
          </div>
        )}

        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
            ${dragOver ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept="image/*,application/pdf,application/json,.json" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
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
              <p className="text-xs text-gray-400">or click to browse — JPG, PNG, PDF supported{isShopkeeper ? ', JSON invoice import supported' : ''}</p>
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
                  <td className="px-2 py-1.5 border-r border-gray-100">
                    <div className={`flex items-center gap-1 rounded border px-1.5 py-1 ${confClass(row.product_name.confidence)}`}>
                      <ConfIcon score={row.product_name.confidence} />
                      <select
                        className="w-full bg-transparent text-xs outline-none"
                        value={row.product_id.value}
                        onChange={(e) => {
                          const selected = products.find((p) => p.id === e.target.value);
                          updateCell(i, 'product_id', e.target.value);
                          updateCell(i, 'product_name', selected?.name ?? '');
                        }}
                      >
                        <option value="">Select product</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  </td>
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
          {activeTab === 0 && <ManualTab onSuccess={onClose} prefillName={prefillName} onOpenInvoiceTab={() => setActiveTab(2)} />}
          {activeTab === 1 && <BarcodeTab onFilled={handleFilled} onImportSuccess={onClose} onOpenInvoiceTab={() => setActiveTab(2)} />}
          {activeTab === 2 && <InvoiceTab onSuccess={onClose} />}
        </div>
      </div>
    </div>
  );
}
