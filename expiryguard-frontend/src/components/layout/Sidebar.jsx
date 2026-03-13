import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutGrid, Package, Tag, Truck, Bell, Settings, LogOut, ShieldCheck, Network, ScanBarcode,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '../../store/authStore';
import { useQuery } from '@tanstack/react-query';
import { alertsApi } from '../../api/alerts';



export default function Sidebar({ onClose }) {
  const navigate = useNavigate();
  const { logout, user } = useAuthStore();
  const isDistributor = user?.role === 'distributor';

  const NAV = [
    { to: '/',             label: 'Dashboard',   Icon: LayoutGrid },
    { to: '/inventory',    label: 'Inventory',   Icon: Package },
    { to: '/products',     label: 'Products',    Icon: Tag },
    { to: '/suppliers',    label: 'Suppliers',   Icon: Truck },
    { to: '/alerts',       label: 'Alerts',      Icon: Bell,        badge: true },
    { to: '/billing',      label: 'Smart Checkout', Icon: ScanBarcode },
    ...(isDistributor ? [{ to: '/distributor', label: 'Network', Icon: Network }] : []),
    { to: '/settings',     label: 'Settings',    Icon: Settings },
  ];

  const { data: alertData } = useQuery({
    queryKey: ['alerts', { page: 1, limit: 1 }],
    queryFn: () => alertsApi.list({ page: 1, limit: 1 }),
    refetchInterval: 30_000,
  });
  const unread = alertData?.unread_count ?? 0;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-100 w-60">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-100">
        <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900 leading-none">ExpiryGuard</p>
          <p className="text-xs text-gray-400 mt-0.5">Inventory Manager</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, label, Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )
            }
          >
            <Icon className="w-4.5 h-4.5 flex-shrink-0" size={18} />
            <span className="flex-1">{label}</span>
            {badge && unread > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-5 text-center">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-4">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </div>
  );
}
