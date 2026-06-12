import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  RadioReceiver,
  FileCheck2,
  IndianRupee,
  Landmark,
  Wallet,
  Flag,
  Settings,
  LogOut,
  Tag,
  Star,
  MessageSquareHeart,
  Megaphone,
} from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
    isActive
      ? 'bg-[var(--color-brand-muted)] text-[#7b2cff]'
      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
  }`;

const items = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/receivers', label: 'Receivers', icon: RadioReceiver },
  { to: '/kyc', label: 'KYC Approvals', icon: FileCheck2 },
  { to: '/revenue', label: 'Revenue', icon: IndianRupee },
  { to: '/admin-earnings', label: 'Admin Earnings', icon: Landmark },
  { to: '/withdrawals', label: 'Receiver Withdrawals', icon: Wallet },
  { to: '/wallet-offers', label: 'Wallet Offers', icon: Tag },
  { to: '/receiver-welcome', label: 'Receiver Welcome', icon: MessageSquareHeart },
  { to: '/caller-notification', label: 'Caller Notification', icon: Megaphone },
  { to: '/reports', label: 'Reports', icon: Flag },
  { to: '/ratings', label: 'Ratings', icon: Star },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

export function AdminSidebar() {
  const { admin, signOut } = useAdminAuth();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#7b2cff] text-xs font-black text-white">
          N
        </div>
        <div>
          <p className="text-xs font-semibold text-neutral-500">Selecto</p>
          <p className="text-sm font-bold text-neutral-900">Admin</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClass} end={to === '/overview'}>
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-neutral-100 p-3">
        <div className="flex items-center gap-2 rounded-xl px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-600">
            {admin?.name?.charAt(0) ?? 'A'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-neutral-900">{admin?.name ?? 'Admin'}</p>
            <p className="truncate text-xs text-neutral-500">{admin?.role === 'super_admin' ? 'Super Admin' : admin?.role === 'finance_admin' ? 'Finance Admin' : 'Support Admin'}</p>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-red-600"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}