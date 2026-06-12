import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import { AdminLayout } from './components/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ReceiversPage } from './pages/ReceiversPage';
import { KycApprovalsPage } from './pages/KycApprovalsPage';
import { AppUsersPage } from './pages/AppUsersPage';
import { SettingsPage } from './pages/SettingsPage';
import { RevenuePage } from './pages/RevenuePage';
import { AdminEarningsPage } from './pages/AdminEarningsPage';
import { WithdrawalsPage } from './pages/WithdrawalsPage';
import { ReportsPage } from './pages/ReportsPage';
import { RatingsPage } from './pages/RatingsPage';
import { WalletOffersPage } from './pages/WalletOffers';
import { ReceiverWelcomePage } from './pages/ReceiverWelcomePage';
import { CallerNotificationPage } from './pages/CallerNotificationPage';

function RequireAuth() {
  const { token, bootstrapping } = useAdminAuth();
  const location = useLocation();

  if (bootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 text-sm text-neutral-500">
        Loading…
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/users" element={<AppUsersPage />} />
          <Route path="/receivers" element={<ReceiversPage />} />
          <Route path="/kyc" element={<KycApprovalsPage />} />
          <Route path="/revenue" element={<RevenuePage />} />
          <Route path="/admin-earnings" element={<AdminEarningsPage />} />
          <Route path="/withdrawals" element={<WithdrawalsPage />} />
          <Route path="/wallet-offers" element={<WalletOffersPage />} />
          <Route path="/receiver-welcome" element={<ReceiverWelcomePage />} />
          <Route path="/caller-notification" element={<CallerNotificationPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/ratings" element={<RatingsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AdminAuthProvider>
      <AppRoutes />
    </AdminAuthProvider>
  );
}