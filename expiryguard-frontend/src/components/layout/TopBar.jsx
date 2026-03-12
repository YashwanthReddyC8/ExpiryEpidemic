import { Bell, LogOut, Settings, User, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useQuery } from '@tanstack/react-query';
import { alertsApi } from '../../api/alerts';
import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';

export default function TopBar({ onMenuClick }) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef(null);

  const { data: alertData } = useQuery({
    queryKey: ['alerts', { page: 1, limit: 1 }],
    queryFn: () => alertsApi.list({ page: 1, limit: 1 }),
    refetchInterval: 30_000,
  });
  const unread = alertData?.unread_count ?? 0;

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (!dropRef.current?.contains(e.target)) setDropOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center px-4 gap-4 flex-shrink-0">
      {/* Hamburger (mobile) */}
      <button
        className="lg:hidden p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Shop name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{user?.shop_name ?? 'ExpiryGuard'}</p>
        <p className="text-xs text-gray-400 capitalize">{user?.shop_type ?? ''}</p>
      </div>

      {/* Alert bell */}
      <button
        onClick={() => navigate('/alerts')}
        className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        aria-label="Alerts"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* User dropdown */}
      <div className="relative" ref={dropRef}>
        <button
          onClick={() => setDropOpen(!dropOpen)}
          className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <div className="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center">
            <span className="text-xs font-bold text-primary-600">
              {user?.name?.[0]?.toUpperCase() ?? 'U'}
            </span>
          </div>
          <span className="text-sm font-medium text-gray-700 hidden sm:block max-w-[120px] truncate">
            {user?.name ?? 'User'}
          </span>
          <ChevronDown size={14} className="text-gray-400" />
        </button>

        {dropOpen && (
          <div className="absolute right-0 top-10 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
            <button
              onClick={() => { navigate('/settings'); setDropOpen(false); }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Settings size={15} /> Settings
            </button>
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-500 hover:bg-red-50"
            >
              <LogOut size={15} /> Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
