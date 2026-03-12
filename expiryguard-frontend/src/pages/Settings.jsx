import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { LogOut, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const THRESHOLD_LABELS = [
  { key: 'alert_60', label: '60 days expiry notice' },
  { key: 'alert_30', label: '30 days expiry notice' },
  { key: 'alert_15', label: '15 days expiry warning' },
  { key: 'alert_7',  label: '7 days expiry alert' },
  { key: 'whatsapp_alerts', label: 'Enable WhatsApp notifications' },
];

function Toggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative inline-flex w-10 h-5 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-primary-600' : 'bg-gray-200'}`}
    >
      <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transition-transform mt-0.5 ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function Settings() {
  const { user, logout, setAuth } = useAuthStore();
  const navigate = useNavigate();

  const [profile, setProfile] = useState({
    name: user?.name ?? '',
    shop_name: user?.shop_name ?? '',
    phone: user?.phone ?? '',
    whatsapp_number: user?.whatsapp_number ?? '',
  });
  const [prefs, setPrefs] = useState({
    alert_60: user?.alert_prefs?.alert_60 ?? true,
    alert_30: user?.alert_prefs?.alert_30 ?? true,
    alert_15: user?.alert_prefs?.alert_15 ?? true,
    alert_7:  user?.alert_prefs?.alert_7  ?? true,
    whatsapp_alerts: user?.alert_prefs?.whatsapp_alerts ?? false,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await api.patch('/users/me', profile).then((r) => r.data);
      // Update Zustand local state
      setAuth({ user: { ...user, ...updated }, access_token: useAuthStore.getState().accessToken, refresh_token: useAuthStore.getState().refreshToken });
      toast.success('Profile saved');
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Save failed');
    } finally {
      setSavingProfile(false);
    }
  };

  const savePrefs = async () => {
    setSavingPrefs(true);
    try {
      await api.patch('/users/me', { alert_prefs: prefs }).then((r) => r.data);
      toast.success('Preferences saved');
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Save failed');
    } finally {
      setSavingPrefs(false);
    }
  };

  const setP = (f) => (e) => setProfile({ ...profile, [f]: e.target.value });

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Settings</h1>

      {/* Profile */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Profile</h2>
        <form onSubmit={saveProfile} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Full name</label>
              <input className="input" value={profile.name} onChange={setP('name')} />
            </div>
            <div>
              <label className="label">Shop name</label>
              <input className="input" value={profile.shop_name} onChange={setP('shop_name')} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={profile.phone} onChange={setP('phone')} />
            </div>
            <div>
              <label className="label">WhatsApp number</label>
              <input className="input" value={profile.whatsapp_number} onChange={setP('whatsapp_number')} />
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg px-4 py-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-xs text-gray-400">Email</p>
              <p className="font-medium text-gray-700 truncate">{user?.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Role</p>
              <p className="font-medium text-gray-700 capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Shop type</p>
              <p className="font-medium text-gray-700 capitalize">{user?.shop_type}</p>
            </div>
          </div>
          <button type="submit" disabled={savingProfile} className="btn-primary flex items-center gap-2">
            <Save size={15} /> {savingProfile ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>

      {/* Alert preferences */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Alert preferences</h2>
        <div className="space-y-3">
          {THRESHOLD_LABELS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between py-1">
              <p className="text-sm text-gray-700">{label}</p>
              <Toggle on={prefs[key]} onChange={(v) => setPrefs({ ...prefs, [key]: v })} />
            </div>
          ))}
        </div>
        <button onClick={savePrefs} disabled={savingPrefs} className="btn-primary flex items-center gap-2 mt-4">
          <Save size={15} /> {savingPrefs ? 'Saving…' : 'Save preferences'}
        </button>
      </div>

      {/* Danger */}
      <div className="card p-5 border border-red-100">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Danger zone</h2>
        <button onClick={() => { logout(); navigate('/login'); }} className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700">
          <LogOut size={16} /> Sign out of ExpiryGuard
        </button>
      </div>
    </div>
  );
}
