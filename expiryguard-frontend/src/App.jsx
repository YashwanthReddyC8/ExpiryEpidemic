import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import AppLayout from './components/layout/AppLayout';
import Login            from './pages/Login';
import Register         from './pages/Register';
import Dashboard        from './pages/Dashboard';
import Inventory        from './pages/Inventory';
import Products         from './pages/Products';
import Suppliers        from './pages/Suppliers';
import Alerts           from './pages/Alerts';
import Settings         from './pages/Settings';
import DistributorDashboard from './pages/DistributorDashboard';
import InviteAccept     from './pages/InviteAccept';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { fontSize: '13px', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' },
        }}
      />
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login"             element={<Login />} />
          <Route path="/register"          element={<Register />} />
          <Route path="/invite/:distributorId" element={<InviteAccept />} />

          {/* Protected routes */}
          <Route element={<AppLayout />}>
            <Route path="/"              element={<Dashboard />} />
            <Route path="/inventory"     element={<Inventory />} />
            <Route path="/products"      element={<Products />} />
            <Route path="/suppliers"     element={<Suppliers />} />
            <Route path="/alerts"        element={<Alerts />} />
            <Route path="/settings"      element={<Settings />} />
            <Route path="/distributor"   element={<DistributorDashboard />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
