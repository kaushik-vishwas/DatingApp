import type { AppUserRecord } from '../api/client';
import { formatJoinedDate, formatPhoneIN } from '../utils/userDisplay';

type Props = {
  user: AppUserRecord | null;
  onClose: () => void;
};

export function AppUserDetailModal({ user, onClose }: Props) {
  if (!user) return null;

  const statusLabel = user.suspended ? 'Suspended' : 'Active';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">{user.name}</h2>
            <p className="mt-1 text-sm text-neutral-500">{user.email}</p>
            <p className="text-sm text-neutral-500">{formatPhoneIN(user.phone)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-neutral-500 hover:bg-neutral-100"
          >
            Close
          </button>
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Account status</dt>
            <dd className="font-medium text-neutral-900">{user.accountStatus}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Access</dt>
            <dd className="font-medium text-neutral-900">{statusLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Wallet</dt>
            <dd className="font-medium text-neutral-900">₹{user.walletBalance.toLocaleString('en-IN')}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Joined</dt>
            <dd className="font-medium text-neutral-900">{formatJoinedDate(user.createdAt)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
