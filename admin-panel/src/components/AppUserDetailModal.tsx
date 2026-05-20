import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';

import { approveAppUser, rejectAppUser, type AppUserRecord } from '../api/client';
import { ProfileImagePreview } from './ProfileImagePreview';
import { formatJoinedDate, formatPhoneIN } from '../utils/userDisplay';

type Props = {
  user: AppUserRecord | null;
  onClose: () => void;
  onChanged?: () => void;
  onEdit?: (user: AppUserRecord) => void;
};

export function AppUserDetailModal({ user, onClose, onChanged, onEdit }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!user) return null;

  const statusLabel = user.suspended ? 'Suspended' : 'Active';
  const pending = user.accountStatus === 'pending_review';
  const rejected = user.accountStatus === 'rejected';
  const showApprove =
    user.suspended || pending || (rejected && !user.suspended);
  const showSuspend = !user.suspended && user.accountStatus !== 'pending_profile';

  const onApprove = async () => {
    setBusy(true);
    setErr(null);
    try {
      await approveAppUser(user._id);
      onChanged?.();
      onClose();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Approve failed';
      setErr(msg || 'Approve failed');
    } finally {
      setBusy(false);
    }
  };

  const onReject = async () => {
    if (!window.confirm('Pause this user’s access? They will stay in the app as paused until you enable access again.'))
      return;
    setBusy(true);
    setErr(null);
    try {
      await rejectAppUser(user._id);
      onChanged?.();
      onClose();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Reject failed';
      setErr(msg || 'Reject failed');
    } finally {
      setBusy(false);
    }
  };

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
            <dt className="text-neutral-500">Profile / review status</dt>
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

        <ProfileImagePreview profileImage={user.profileImage} alt={user.name} />

        {user.userAudio ? (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Voice verification</p>
            <audio
              className="mt-2 w-full"
              controls
              src={user.userAudio}
              preload="metadata"
            >
              <track kind="captions" />
            </audio>
          </div>
        ) : (
          <p className="mt-4 text-sm text-neutral-500">No voice verification audio on file.</p>
        )}

        {err ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {err}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          {onEdit ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onEdit(user)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          ) : null}
        </div>

        {showApprove || showSuspend ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {showApprove ? (
              <button
                type="button"
                disabled={busy || ((pending || rejected) && !user.userAudio)}
                onClick={() => void onApprove()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {user.suspended ? 'Enable access' : rejected ? 'Approve (legacy)' : 'Approve user'}
              </button>
            ) : null}
            {showSuspend ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onReject()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Pause access
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
