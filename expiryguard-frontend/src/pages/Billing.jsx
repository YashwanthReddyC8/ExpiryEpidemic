import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield, ShieldCheck, Package, ArrowLeft, CheckCircle2, XCircle,
  CreditCard, Receipt, Clock, ScanBarcode, User, Banknote, QrCode,
  Smartphone, Activity, LayoutDashboard,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getSessions, getSessionItems, verifySession, paySession,
  rejectSession, updatePaymentMethod,
} from '../api/billing';

const STATE_COLORS = {
  ACTIVE:   'bg-indigo-100 text-indigo-700',
  LOCKED:   'bg-yellow-100 text-yellow-700',
  VERIFIED: 'bg-blue-100   text-blue-700',
  PAID:     'bg-green-100  text-green-700',
};

const PAYMENT_LABELS = {
  cash:        { label: 'Cash',        Icon: Banknote },
  card:        { label: 'Card',        Icon: CreditCard },
  upi_counter: { label: 'UPI Counter', Icon: QrCode },
  upi_app:     { label: 'UPI App',     Icon: Smartphone },
};

/* ─── tiny helpers ────────────────────────────────────────────── */
function Btn({ children, className = '', ...rest }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ─── Session Detail ──────────────────────────────────────────── */
function SessionDetail({ session, items, onBack, onVerify, onPay, onReject, onPayMethod }) {
  const payInfo = PAYMENT_LABELS[session.payment_method] || PAYMENT_LABELS.cash;
  const isLocked   = session.state === 'LOCKED';
  const isVerified = session.state === 'VERIFIED';
  const isPaid     = session.state === 'PAID';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-lg p-2 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Cart Verification</h1>
            <p className="font-mono text-xs text-gray-500">{session.session_code}</p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATE_COLORS[session.state]}`}>
          {session.state}
        </span>
      </div>

      <div className="mx-auto max-w-2xl space-y-4">
        {/* Customer */}
        <div className="flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm">
          <User className="h-5 w-5 text-indigo-600" />
          <div>
            <p className="text-xs text-gray-500">Customer</p>
            <p className="font-medium text-gray-900">{session.customer_name}</p>
          </div>
        </div>

        {/* Cart hash */}
        {session.cart_hash && (
          <div className="flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm">
            <Shield className="h-5 w-5 text-indigo-600 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-gray-500">SHA-256 Cart Fingerprint</p>
              <p className="font-mono text-xs font-bold text-gray-800 break-all">{session.cart_hash}</p>
            </div>
          </div>
        )}

        {/* Payment Method */}
        <div className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <payInfo.Icon className="h-5 w-5 text-indigo-600" />
            <div>
              <p className="text-xs text-gray-500">Payment Method</p>
              <p className="font-medium text-gray-900">{payInfo.label}</p>
            </div>
          </div>
          {isLocked && (
            <div className="flex gap-1">
              {Object.entries(PAYMENT_LABELS).map(([key, val]) => (
                <button
                  key={key}
                  title={val.label}
                  onClick={() => onPayMethod(key)}
                  className={`rounded-lg p-2 transition-colors ${
                    session.payment_method === key
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <val.Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Items list */}
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold text-gray-500">
                {idx + 1}
              </span>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
                <Package className="h-5 w-5 text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{item.title}</p>
                <p className="font-mono text-xs text-gray-500">{item.barcode}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-gray-800">×{item.quantity}</p>
                <p className="text-sm text-indigo-600 font-medium">₹{(item.price * item.quantity).toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between rounded-xl border-2 border-indigo-100 bg-indigo-50 p-4">
          <span className="font-medium text-gray-700">Total Amount</span>
          <span className="text-2xl font-bold text-indigo-600">₹{session.total_amount.toFixed(2)}</span>
        </div>

        {/* Actions */}
        {isLocked && (
          <div className="flex gap-3 pt-2">
            <Btn
              className="flex-1 bg-indigo-600 text-white hover:bg-indigo-700 py-4 text-base"
              onClick={() => onVerify(session.id)}
            >
              <CheckCircle2 className="mr-2 h-5 w-5" /> Approve Cart
            </Btn>
            <Btn
              className="flex-1 bg-red-600 text-white hover:bg-red-700 py-4 text-base"
              onClick={() => onReject(session.id)}
            >
              <XCircle className="mr-2 h-5 w-5" /> Reject
            </Btn>
          </div>
        )}

        {isVerified && (
          <Btn
            className="w-full bg-green-600 text-white hover:bg-green-700 py-4 text-base"
            onClick={() => onPay(session.id)}
          >
            <CreditCard className="mr-2 h-5 w-5" /> Mark as Paid
          </Btn>
        )}

        {isPaid && (
          <div className="rounded-xl border-2 border-green-100 bg-green-50 p-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-green-600" />
            <p className="text-lg font-semibold text-green-800">Payment Complete!</p>
            <p className="mt-1 text-sm text-green-600">Invoice generated — customer can proceed to exit.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Billing Page ───────────────────────────────────────── */
export default function Billing() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [scanInput, setScanInput] = useState('');
  const [tab, setTab] = useState('overview');

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['billing_sessions'],
    queryFn: getSessions,
    refetchInterval: 5000,
  });

  const { data: sessionItems = [] } = useQuery({
    queryKey: ['billing_items', selectedId],
    queryFn: () => getSessionItems(selectedId),
    enabled: !!selectedId,
  });

  const selectedSession = sessions.find((s) => s.id === selectedId) || null;

  const invalidate = () => qc.invalidateQueries(['billing_sessions']);

  const verifyMut  = useMutation({ mutationFn: verifySession,         onSuccess: () => { toast.success('Cart Verified!'); invalidate(); } });
  const payMut     = useMutation({ mutationFn: paySession,            onSuccess: () => { toast.success('Payment Recorded!'); invalidate(); } });
  const rejectMut  = useMutation({ mutationFn: rejectSession,         onSuccess: () => { toast.info('Cart Rejected.'); setSelectedId(null); invalidate(); } });
  const payMethMut = useMutation({
    mutationFn: ({ id, method }) => updatePaymentMethod(id, method),
    onSuccess: () => { toast.success('Payment method updated'); invalidate(); },
  });

  const lockedSessions   = sessions.filter((s) => s.state === 'LOCKED');
  const verifiedSessions = sessions.filter((s) => s.state === 'VERIFIED');
  const paidSessions     = sessions.filter((s) => s.state === 'PAID');
  const todaysRevenue    = paidSessions.reduce((s, r) => s + r.total_amount, 0);

  const handleScanQR = (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    if (!input) return;
    const found = sessions.find((s) => s.session_code === input || s.id === input);
    if (found && found.state === 'LOCKED') {
      setSelectedId(found.id);
      setTab('overview');
      setScanInput('');
    } else if (found) {
      toast.error(`Session is already ${found.state}`);
    } else {
      toast.error('Session not found');
    }
  };

  // Show detail view when a session is selected
  if (selectedSession) {
    return (
      <SessionDetail
        session={selectedSession}
        items={sessionItems}
        onBack={() => setSelectedId(null)}
        onVerify={(id) => verifyMut.mutate(id)}
        onPay={(id) => payMut.mutate(id)}
        onReject={(id) => rejectMut.mutate(id)}
        onPayMethod={(method) => payMethMut.mutate({ id: selectedSession.id, method })}
      />
    );
  }

  /* ─── Tabs ──────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <ScanBarcode className="h-8 w-8 text-indigo-600" />
          Smart Checkout
        </h1>
        <p className="text-gray-500 mt-1">Queue-less cart verification & payment management.</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { key: 'overview', label: 'Overview',    Icon: LayoutDashboard },
          { key: 'scanner',  label: 'QR Scanner',  Icon: ScanBarcode },
        ].map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'Pending',         value: lockedSessions.length,           Icon: Shield,      color: 'text-yellow-600', bg: 'bg-yellow-50' },
              { label: 'Ready for Payment', value: verifiedSessions.length,        Icon: ShieldCheck, color: 'text-blue-600',   bg: 'bg-blue-50'   },
              { label: 'Bills Today',      value: paidSessions.length,             Icon: Receipt,     color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { label: "Today's Revenue",  value: `₹${todaysRevenue.toFixed(0)}`, Icon: Banknote,    color: 'text-green-600',  bg: 'bg-green-50'  },
            ].map(({ label, value, Icon, color, bg }) => (
              <div key={label} className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${bg} mb-3`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-sm text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Quick scan input */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
              <ScanBarcode className="h-5 w-5 text-indigo-600" /> Quick Lookup
            </h3>
            <form onSubmit={handleScanQR} className="flex gap-3 max-w-md">
              <input
                type="text"
                placeholder="Session code (e.g. QL-9A2X)..."
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm uppercase shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <Btn
                type="submit"
                disabled={!scanInput.trim()}
                className="bg-indigo-600 text-white hover:bg-indigo-700 px-5"
              >
                Lookup
              </Btn>
            </form>
          </div>

          {/* Session cards */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5 text-indigo-600" />
              <h3 className="font-semibold text-gray-900 text-lg">Live Shopping Queues</h3>
              <span className="ml-auto text-sm text-gray-400">{sessions.length} sessions</span>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="rounded-xl border border-dashed p-12 text-center text-gray-400">
                <Clock className="mx-auto mb-3 h-8 w-8 opacity-40" />
                <p>No active self-checkout sessions yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {sessions.map((sess) => {
                  const payLabel = PAYMENT_LABELS[sess.payment_method] || PAYMENT_LABELS.cash;
                  return (
                    <button
                      key={sess.id}
                      onClick={() => setSelectedId(sess.id)}
                      className="flex flex-col gap-3 rounded-xl border bg-white p-4 text-left shadow-sm hover:border-indigo-300 hover:ring-1 hover:ring-indigo-300 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {sess.state === 'LOCKED'   && <Shield    className="h-4 w-4 text-yellow-500" />}
                          {sess.state === 'VERIFIED' && <ShieldCheck className="h-4 w-4 text-blue-500" />}
                          {sess.state === 'PAID'     && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                          <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${STATE_COLORS[sess.state]}`}>
                            {sess.state}
                          </span>
                        </div>
                        <span className="font-mono text-sm font-bold text-gray-700">{sess.session_code}</span>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-gray-900">₹{sess.total_amount.toFixed(2)}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{sess.customer_name} · {payLabel.label}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Scanner Tab ── */}
      {tab === 'scanner' && (
        <div className="mx-auto max-w-xl rounded-xl border bg-white p-8 shadow-sm space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
              <QrCode className="h-8 w-8 text-indigo-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Verify Customer Cart</h2>
            <p className="mt-1 text-sm text-gray-500">
              Ask the customer for their session code or QR code and enter it below.
            </p>
          </div>

          <form onSubmit={handleScanQR} className="space-y-3">
            <input
              type="text"
              autoFocus
              placeholder="Session Code (e.g. QL-9A2X) ..."
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 font-mono text-lg uppercase tracking-widest shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <Btn
              type="submit"
              disabled={!scanInput.trim()}
              className="w-full bg-indigo-600 text-white hover:bg-indigo-700 py-3 text-base"
            >
              <ScanBarcode className="mr-2 h-5 w-5" /> Scan & Open Cart
            </Btn>
          </form>

          <div className="border-t pt-4 text-center text-xs text-gray-400">
            Sessions refresh every 5 seconds. Verified sessions auto-show payment button.
          </div>
        </div>
      )}
    </div>
  );
}
