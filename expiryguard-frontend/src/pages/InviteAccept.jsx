import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, Link2, Loader2, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { suppliersApi } from '../api/suppliers';
import { useAuthStore } from '../store/authStore';

export default function InviteAccept() {
  const { distributorId } = useParams();
  const navigate = useNavigate();
  const { accessToken, user } = useAuthStore();
  const [status, setStatus] = useState('idle'); // idle | linking | done | error
  const [distributorName, setDistributorName] = useState('your distributor');

  useEffect(() => {
    if (!accessToken) return; // Not logged in — wait for redirect
    if (!distributorId) return;

    setStatus('linking');
    suppliersApi.linkDistributor(distributorId)
      .then((data) => {
        setStatus('done');
        if (data?.distributor_name) setDistributorName(data.distributor_name);
        toast.success('You are now linked!');
        setTimeout(() => navigate('/'), 2500);
      })
      .catch((err) => {
        const msg = err.response?.data?.detail ?? 'Linking failed';
        if (msg.toLowerCase().includes('already')) {
          setStatus('done');
          toast('Already linked to this distributor', { icon: 'ℹ️' });
          setTimeout(() => navigate('/'), 2000);
        } else {
          setStatus('error');
          toast.error(msg);
        }
      });
  }, [accessToken, distributorId]);

  // Not logged in
  if (!accessToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center">
          <div className="w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-200">
            <Link2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Join your distributor</h1>
          <p className="text-sm text-gray-500 mb-6">
            Create an ExpiryGuard account to link your shop to your distributor's network.
          </p>
          <Link
            to={`/register?distributorId=${distributorId}`}
            className="btn-primary block"
          >
            Create account & link
          </Link>
          <p className="text-sm text-gray-400 mt-3">
            Already have an account?{' '}
            <Link to={`/login?next=/invite/${distributorId}`} className="text-primary-600 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center">
        {status === 'linking' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-primary-500 mx-auto mb-4" />
            <p className="text-gray-700 font-medium">Linking your account…</p>
          </>
        )}
        {status === 'done' && (
          <>
            <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">You're linked! 🎉</h1>
            <p className="text-sm text-gray-500">You're now connected to <strong>{distributorName}</strong>. Redirecting to dashboard…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="text-red-500 font-medium mb-4">Linking failed. The invite link may be invalid.</p>
            <Link to="/" className="btn-primary">Go to dashboard</Link>
          </>
        )}
      </div>
    </div>
  );
}
