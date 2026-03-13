import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { productsApi } from '../api/products';
import EmptyState from '../components/shared/EmptyState';
import SkeletonCard from '../components/shared/SkeletonCard';
import { Tag } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

function ProductForm({ initial = {}, onSubmit, loading, onCancel }) {
  const [form, setForm] = useState({ name: '', sku: '', barcode: '', unit: 'pcs', category: '', ...initial });
  const set = (f) => (e) => setForm({ ...form, [f]: e.target.value });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Product name *</label>
          <input className="input" required value={form.name} onChange={set('name')} placeholder="Paracetamol 500mg" />
        </div>
        <div>
          <label className="label">SKU *</label>
          <input className="input" required value={form.sku} onChange={set('sku')} placeholder="PCT-500" />
        </div>
        <div>
          <label className="label">Unit</label>
          <select className="select" value={form.unit} onChange={set('unit')}>
            {['pcs', 'box', 'strip', 'kg', 'litre', 'pack'].map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Barcode <span className="text-gray-400 font-normal">(EAN-13 / UPC-A / Code-128)</span></label>
          <input className="input font-mono" value={form.barcode ?? ''} onChange={set('barcode')} placeholder="8901234560012" />
        </div>
        <div className="col-span-2">
          <label className="label">Category</label>
          <input className="input" value={form.category} onChange={set('category')} placeholder="Analgesics" />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={onCancel} className="btn-secondary px-4">Cancel</button>
      </div>
    </form>
  );
}

export default function Products() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isShopkeeper = user?.role === 'shopkeeper';
  const [editing, setEditing] = useState(null); // null | 'new' | id
  const [supplierSku, setSupplierSku] = useState('');
  const { data: products = [], isLoading } = useQuery({ queryKey: ['products'], queryFn: productsApi.list });

  const createMutation = useMutation({ mutationFn: productsApi.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); setEditing(null); toast.success('Product added'); } });
  const updateMutation = useMutation({ mutationFn: ({ id, data }) => productsApi.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); setEditing(null); toast.success('Product updated'); } });
  const delMutation =    useMutation({ mutationFn: productsApi.delete, onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Deleted'); }, onError: () => toast.error('Delete failed') });
  const importMutation = useMutation({
    mutationFn: productsApi.importFromSupplier,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setSupplierSku('');
      toast.success('Product imported from supplier');
    },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Import failed'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Products</h1>
        <button onClick={() => setEditing('new')} className="btn-primary flex items-center gap-1.5"><Plus size={15} /> Add Product</button>
      </div>

      {isShopkeeper && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-700">Add from distributor SKU</h2>
          <p className="text-xs text-gray-500 mt-1">If your distributor shared a SKU, paste it to auto-add this product to your catalog.</p>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <input
              className="input flex-1"
              placeholder="Enter distributor SKU"
              value={supplierSku}
              onChange={(e) => setSupplierSku(e.target.value)}
            />
            <button
              className="btn-secondary"
              disabled={importMutation.isPending || !supplierSku.trim()}
              onClick={() => importMutation.mutate(supplierSku.trim())}
            >
              {importMutation.isPending ? 'Importing…' : 'Import Product'}
            </button>
          </div>
        </div>
      )}

      {editing === 'new' && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-3 text-gray-700">New product</h2>
          <ProductForm onSubmit={(d) => createMutation.mutate(d)} loading={createMutation.isPending} onCancel={() => setEditing(null)} />
        </div>
      )}

      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="flex flex-col">
            {[...Array(5)].map((_, i) => <SkeletonCard key={i} variant="row" />)}
          </div>
        ) : products.length === 0 && editing !== 'new' ? (
          <EmptyState title="No products yet" description="Add your product catalogue to start tracking batches." icon={Tag} action={<button onClick={() => setEditing('new')} className="btn-primary flex items-center gap-1.5"><Plus size={15} /> Add Product</button>} />
        ) : (
          <table className="w-full text-sm min-w-[600px]">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>{['Name', 'SKU', 'Barcode', 'Unit', 'Category', ''].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
            </thead>
            <tbody>
              {products.map((p) => (
                editing === p.id ? (
                  <tr key={p.id}><td colSpan={6} className="px-4 py-4">
                    <ProductForm initial={p} onSubmit={(d) => updateMutation.mutate({ id: p.id, data: d })} loading={updateMutation.isPending} onCancel={() => setEditing(null)} />
                  </td></tr>
                ) : (
                  <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.sku ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{p.barcode ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{p.unit}</td>
                    <td className="px-4 py-3 text-gray-500">{p.category ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setEditing(p.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-primary-600"><Pencil size={14} /></button>
                        <button onClick={() => { if (confirm(`Delete ${p.name}?`)) delMutation.mutate(p.id); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
