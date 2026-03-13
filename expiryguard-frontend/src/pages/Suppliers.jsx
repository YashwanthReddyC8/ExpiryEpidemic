import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, Truck, Search, UserPlus2,
  CheckCircle2, XCircle, Clock, Link2, Mail, Building2,
  Send, Loader2, UserCheck, Store, ShieldCheck, Phone,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { suppliersApi } from '../api/suppliers';
import {
  searchUser, sendConnectRequest,
  getIncomingRequests, getSentRequests, handleRequest,
} from '../api/network';
import EmptyState from '../components/shared/EmptyState';
import SkeletonCard from '../components/shared/SkeletonCard';
import { useAuthStore } from '../store/authStore';

/* ─── Manual Supplier Form ────────────────────────────────── */
function SupplierForm({ initial = {}, onSubmit, loading, onCancel }) {
  const [form, setForm] = useState({
    name: '', contact_name: '', phone: '', whatsapp_number: '', address: '', ...initial,
  });
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
        <button type="submit" disabled={loading} className="btn-primary flex-1">
          {loading ? 'Saving…' : 'Save Supplier'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary px-4">Cancel</button>
      </div>
    </form>
  );
}

/* ─── Connect by Email Modal ──────────────────────────────── */
function ConnectModal({ onClose }) {
  const qc = useQueryClient();
  const [email, setEmail]     = useState('');
  const [message, setMessage] = useState('');
  const [found, setFound]     = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState('');

  const connectMut = useMutation({
    mutationFn: () => sendConnectRequest(found.id, message),
    onSuccess: (res) => {
      toast.success(`Request sent to ${res.to_name}!`);
      qc.invalidateQueries(['network_sent']);
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Failed to send request'),
  });

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSearching(true); setSearchErr(''); setFound(null);
    try {
      setFound(await searchUser(email.trim()));
    } catch (err) {
      setSearchErr(err?.response?.data?.detail || 'No user found with that email');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between bg-indigo-600 px-5 py-4">
          <div className="flex items-center gap-2 text-white">
            <Link2 className="h-5 w-5" />
            <span className="font-semibold">Connect by Email</span>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white text-xl leading-none px-2">×</button>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-sm text-gray-500">
            Enter the email of a distributor already registered on ExpiryGuard.
            They'll receive a request to connect — no manual data entry needed.
          </p>

          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="email"
                placeholder="distributor@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFound(null); setSearchErr(''); }}
                className="input pl-9"
                autoFocus
              />
            </div>
            <button type="submit" disabled={searching || !email.trim()} className="btn-primary px-4 flex items-center gap-1.5">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </button>
          </form>

          {searchErr && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <XCircle className="h-4 w-4 flex-shrink-0" /> {searchErr}
            </div>
          )}

          {found && (
            <div className="rounded-xl border-2 border-indigo-100 bg-indigo-50 p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-200">
                  <UserCheck className="h-6 w-6 text-indigo-700" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{found.name}</p>
                  {found.shop_name && (
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />{found.shop_name}
                    </p>
                  )}
                  <span className="inline-block mt-0.5 rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 uppercase">
                    {found.role.replace('_', ' ')}
                  </span>
                </div>
              </div>
              <div>
                <label className="label">Message (optional)</label>
                <textarea
                  rows={2}
                  placeholder="Hey, I'd like to connect my shop with your distribution network…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="input resize-none"
                />
              </div>
              <button
                onClick={() => connectMut.mutate()}
                disabled={connectMut.isPending}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {connectMut.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  : <><Send className="h-4 w-4" /> Send Connection Request</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Incoming requests banner (both roles see this) ──────── */
function IncomingRequests({ qc }) {
  const { data: requests = [] } = useQuery({
    queryKey: ['network_requests'],
    queryFn: getIncomingRequests,
    refetchInterval: 15000,
  });

  const actionMut = useMutation({
    mutationFn: ({ id, action }) => handleRequest(id, action),
    onSuccess: (res) => {
      toast.success(res.status === 'accepted' ? '✅ Connected!' : 'Request declined');
      qc.invalidateQueries(['network_requests']);
      qc.invalidateQueries(['retailers']);
    },
    onError: () => toast.error('Action failed'),
  });

  const pending = requests.filter((r) => r.status === 'pending');
  if (pending.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-800">
        <Clock className="h-4 w-4" />
        {pending.length} pending connection {pending.length === 1 ? 'request' : 'requests'}
      </h3>
      {pending.map((req) => (
        <div key={req.id} className="flex items-center justify-between gap-3 rounded-lg bg-white border border-amber-100 p-3">
          <div className="min-w-0">
            <p className="font-medium text-gray-900 text-sm">{req.from_name}</p>
            <p className="text-xs text-gray-500">{req.from_email}{req.from_shop ? ` · ${req.from_shop}` : ''}</p>
            {req.message && <p className="text-xs text-gray-400 italic mt-0.5">"{req.message}"</p>}
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <button
              onClick={() => actionMut.mutate({ id: req.id, action: 'accept' })}
              disabled={actionMut.isPending}
              className="flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Accept
            </button>
            <button
              onClick={() => actionMut.mutate({ id: req.id, action: 'reject' })}
              disabled={actionMut.isPending}
              className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
            >
              <XCircle className="h-3.5 w-3.5" /> Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── DISTRIBUTOR VIEW: My Retailers ─────────────────────── */
function DistributorView({ qc }) {
  const { data: retailers = [], isLoading } = useQuery({
    queryKey: ['retailers'],
    queryFn: suppliersApi.getRetailers,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Retailers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Shop owners connected to your distribution network</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-100 rounded-lg px-3 py-1.5">
          <ShieldCheck className="h-4 w-4 text-indigo-600" />
          {retailers.length} {retailers.length === 1 ? 'retailer' : 'retailers'} connected
        </div>
      </div>

      <IncomingRequests qc={qc} />

      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="flex flex-col">{[...Array(4)].map((_, i) => <SkeletonCard key={i} variant="row" />)}</div>
        ) : retailers.length === 0 ? (
          <EmptyState
            title="No retailers yet"
            description="When shop owners connect to you, they'll appear here. Share your email so they can search and connect."
            icon={Store}
          />
        ) : (
          <table className="w-full text-sm min-w-[600px]">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                {['Shop Name', 'Owner', 'Email', 'Phone'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {retailers.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 flex items-center gap-2">
                    <Store className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                    {r.shop_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.name}</td>
                  <td className="px-4 py-3 text-gray-500">{r.email}</td>
                  <td className="px-4 py-3 text-gray-500 flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />{r.whatsapp_number || r.phone || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ─── SHOPKEEPER VIEW: My Suppliers ──────────────────────── */
function ShopOwnerView({ qc }) {
  const [editing, setEditing]         = useState(null);
  const [showConnect, setShowConnect] = useState(false);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: suppliersApi.list,
  });

  const { data: sent = [] } = useQuery({
    queryKey: ['network_sent'],
    queryFn: getSentRequests,
    refetchInterval: 15000,
  });
  const pendingSent = sent.filter((r) => r.status === 'pending');
  const acceptedSent = sent.filter((r) => r.status === 'accepted');

  const createMut = useMutation({
    mutationFn: suppliersApi.create,
    onSuccess: () => { qc.invalidateQueries(['suppliers']); setEditing(null); toast.success('Supplier added'); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => suppliersApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries(['suppliers']); setEditing(null); toast.success('Updated'); },
  });
  const delMut = useMutation({
    mutationFn: suppliersApi.delete,
    onSuccess: () => { qc.invalidateQueries(['suppliers']); toast.success('Deleted'); },
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Suppliers & Distributors</h1>
          <p className="text-sm text-gray-500 mt-0.5">Connect with distributors on ExpiryGuard, or add offline suppliers manually</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowConnect(true)} className="btn-primary flex items-center gap-1.5">
            <UserPlus2 size={15} /> Connect by Email
          </button>
          <button onClick={() => setEditing('new')} className="btn-secondary flex items-center gap-1.5">
            <Plus size={15} /> Add Manually
          </button>
        </div>
      </div>

      {/* Incoming connection requests */}
      <IncomingRequests qc={qc} />

      {/* Sent but pending */}
      {pendingSent.length > 0 && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-800">
            <Send className="h-4 w-4" />
            {pendingSent.length} request{pendingSent.length > 1 ? 's' : ''} awaiting reply
          </h3>
          {pendingSent.map((req) => (
            <div key={req.id} className="flex items-center justify-between rounded-lg bg-white border border-blue-100 p-2.5">
              <p className="text-sm font-medium text-gray-900">{req.to_name}</p>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">PENDING</span>
            </div>
          ))}
        </div>
      )}

      {acceptedSent.length > 0 && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            Connected distributors
          </h3>
          {acceptedSent.map((req) => (
            <div key={req.id} className="flex items-center justify-between rounded-lg bg-white border border-emerald-100 p-2.5">
              <p className="text-sm font-medium text-gray-900">{req.to_name}</p>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">CONNECTED</span>
            </div>
          ))}
        </div>
      )}

      {/* Manual add */}
      {editing === 'new' && (
        <div className="card p-5">
          <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ℹ️ Use <strong>Connect by Email</strong> if your distributor is registered on ExpiryGuard — no need to fill this form.
          </div>
          <h2 className="text-sm font-semibold mb-3 text-gray-700">Add supplier manually</h2>
          <SupplierForm
            onSubmit={(d) => createMut.mutate(d)}
            loading={createMut.isPending}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {/* Supplier table */}
      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="flex flex-col">{[...Array(5)].map((_, i) => <SkeletonCard key={i} variant="row" />)}</div>
        ) : suppliers.length === 0 && editing !== 'new' ? (
          <EmptyState
            title="No suppliers yet"
            description="Connect with distributors on ExpiryGuard by email, or add offline suppliers manually."
            icon={Truck}
            action={
              <div className="flex gap-2">
                <button onClick={() => setShowConnect(true)} className="btn-primary flex items-center gap-1.5">
                  <UserPlus2 size={15} /> Connect by Email
                </button>
                <button onClick={() => setEditing('new')} className="btn-secondary flex items-center gap-1.5">
                  <Plus size={15} /> Add Manually
                </button>
              </div>
            }
          />
        ) : (
          <table className="w-full text-sm min-w-[700px]">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                {['Company', 'Contact', 'Phone', 'WhatsApp', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                editing === s.id ? (
                  <tr key={s.id}><td colSpan={5} className="px-4 py-4">
                    <SupplierForm
                      initial={s}
                      onSubmit={(d) => updateMut.mutate({ id: s.id, data: d })}
                      loading={updateMut.isPending}
                      onCancel={() => setEditing(null)}
                    />
                  </td></tr>
                ) : (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-4 py-3 text-gray-500">{s.contact_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{s.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{s.whatsapp_number ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setEditing(s.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-indigo-600"><Pencil size={14} /></button>
                        <button onClick={() => { if (confirm(`Delete ${s.name}?`)) delMut.mutate(s.id); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showConnect && <ConnectModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}

/* ─── Root: Render the right view based on role ───────────── */
export default function Suppliers() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isDistributor = user?.role === 'distributor';

  return isDistributor ? <DistributorView qc={qc} /> : <ShopOwnerView qc={qc} />;
}
