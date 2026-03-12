import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { suppliersApi } from '../api/suppliers';
import EmptyState from '../components/shared/EmptyState';
import SkeletonCard from '../components/shared/SkeletonCard';
import { Truck } from 'lucide-react';

function SupplierForm({ initial = {}, onSubmit, loading, onCancel }) {
  const [form, setForm] = useState({ name: '', contact_name: '', phone: '', whatsapp_number: '', address: '', ...initial });
  const set = (f) => (e) => setForm({ ...form, [f]: e.target.value });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Company name *</label>
          <input className="input" required value={form.name} onChange={set('name')} placeholder="Ravi Pharma Distributors" />
        </div>
        <div>
          <label className="label">Contact person</label>
          <input className="input" value={form.contact_name} onChange={set('contact_name')} placeholder="Ravi Kumar" />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.phone} onChange={set('phone')} placeholder="9876543210" />
        </div>
        <div>
          <label className="label">WhatsApp</label>
          <input className="input" value={form.whatsapp_number} onChange={set('whatsapp_number')} placeholder="9876543210" />
        </div>
        <div>
          <label className="label">City / Address</label>
          <input className="input" value={form.address} onChange={set('address')} placeholder="Mumbai" />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={onCancel} className="btn-secondary px-4">Cancel</button>
      </div>
    </form>
  );
}

export default function Suppliers() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const { data: suppliers = [], isLoading } = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list });
  const createMutation = useMutation({ mutationFn: suppliersApi.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); setEditing(null); toast.success('Supplier added'); } });
  const updateMutation = useMutation({ mutationFn: ({ id, data }) => suppliersApi.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); setEditing(null); toast.success('Updated'); } });
  const delMutation    = useMutation({ mutationFn: suppliersApi.delete, onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast.success('Deleted'); } });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Suppliers</h1>
        <button onClick={() => setEditing('new')} className="btn-primary flex items-center gap-1.5"><Plus size={15} /> Add Supplier</button>
      </div>

      {editing === 'new' && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-3 text-gray-700">New supplier</h2>
          <SupplierForm onSubmit={(d) => createMutation.mutate(d)} loading={createMutation.isPending} onCancel={() => setEditing(null)} />
        </div>
      )}

      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="flex flex-col">
            {[...Array(5)].map((_, i) => <SkeletonCard key={i} variant="row" />)}
          </div>
        ) : suppliers.length === 0 && editing !== 'new' ? (
          <EmptyState title="No suppliers yet" description="Add your suppliers so you can link them to batches and generate return memos." icon={Truck} action={<button onClick={() => setEditing('new')} className="btn-primary flex items-center gap-1.5"><Plus size={15} /> Add Supplier</button>} />
        ) : (
          <table className="w-full text-sm min-w-[700px]">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>{['Company', 'Contact', 'Phone', 'WhatsApp', ''].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                editing === s.id ? (
                  <tr key={s.id}><td colSpan={5} className="px-4 py-4">
                    <SupplierForm initial={s} onSubmit={(d) => updateMutation.mutate({ id: s.id, data: d })} loading={updateMutation.isPending} onCancel={() => setEditing(null)} />
                  </td></tr>
                ) : (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-4 py-3 text-gray-500">{s.contact_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{s.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{s.whatsapp_number ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setEditing(s.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-primary-600"><Pencil size={14} /></button>
                        <button onClick={() => { if (confirm(`Delete ${s.name}?`)) delMutation.mutate(s.id); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
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
