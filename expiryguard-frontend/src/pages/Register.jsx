import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/authStore';

const SHOP_TYPES = [
  { value: 'kirana',  label: 'Kirana / General Store' },
  { value: 'medical', label: 'Medical / Pharmacy' },
  { value: 'fmcg',    label: 'FMCG Distributor' },
];

export default function Register() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({
    name: '', email: '', password: '', shop_name: '', shop_type: 'kirana',
    phone: '', whatsapp_number: '', role: 'shop_owner',
  });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await authApi.register(form);
      setAuth(data);
      toast.success('Account created! Welcome to ExpiryGuard 🎉');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-indigo-50 flex items-center justify-center p-4 py-10">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-primary-200">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Create your account</h1>
          <p className="text-sm text-gray-500 mt-0.5">Start managing your inventory smarter</p>
        </div>

        <div className="card p-6 shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Two-col grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Full name</label>
                <input className="input" required placeholder="Ravi Kumar" value={form.name} onChange={set('name')} />
              </div>
              <div className="col-span-2">
                <label className="label">Email</label>
                <input type="email" className="input" required placeholder="you@example.com" value={form.email} onChange={set('email')} />
              </div>
              <div className="col-span-2">
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="input pr-10"
                    required
                    minLength={6}
                    placeholder="Min 6 characters"
                    value={form.password}
                    onChange={set('password')}
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowPw(!showPw)}>
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="col-span-2">
                <label className="label">Shop name</label>
                <input className="input" required placeholder="Ravi Kirana Mart" value={form.shop_name} onChange={set('shop_name')} />
              </div>
              <div>
                <label className="label">Shop type</label>
                <select className="select" value={form.shop_type} onChange={set('shop_type')}>
                  {SHOP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Role</label>
                <select className="select" value={form.role} onChange={set('role')}>
                  <option value="shop_owner">Shop Owner</option>
                  <option value="distributor">Distributor</option>
                </select>
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" required placeholder="9876543210" value={form.phone} onChange={set('phone')} />
              </div>
              <div>
                <label className="label">WhatsApp (optional)</label>
                <input className="input" placeholder="9876543210" value={form.whatsapp_number} onChange={set('whatsapp_number')} />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-600 font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
