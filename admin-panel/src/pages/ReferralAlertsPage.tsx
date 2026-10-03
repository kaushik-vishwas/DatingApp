import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import {
  deleteReceiverPermanently,
  fetchReferralAlerts,
  type ReceiverDeletionRequestRow,
  type ReferralAlertRow,
} from '../api/client';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function alertLabel(type: ReferralAlertRow['type']): string {
  return type === 'burst' ? 'Many rewards in one hour' : 'Number already rewarded';
}

export function ReferralAlertsPage() {
  const [alerts, setAlerts] = useState<ReferralAlertRow[]>([]);
  const [requests, setRequests] = useState<ReceiverDeletionRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReferralAlerts();
      setAlerts(data.alerts);
      setRequests(data.deletionRequests);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Failed to load';
      setError(msg || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onDelete = async (row: ReceiverDeletionRequestRow) => {
    if (
      !window.confirm(
        `Permanently delete ${row.name}? Referral reward history for this account is kept. Chats, calls, and withdrawals are removed.`
      )
    ) {
      return;
    }
    setBusyId(row._id);
    setError(null);
    try {
      await deleteReceiverPermanently(row._id);
      await load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Delete failed';
      setError(msg || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Referral alerts</h1>
          <p className="mt-1 text-sm text-neutral-500">
            A mobile number can receive a referral reward only once. Delete requests wait here until you remove the account.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}

      <h2 className="mt-8 text-lg font-bold text-neutral-900">Delete requests</h2>
      <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-sm text-neutral-500">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">No receiver has asked to delete their account.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/80">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Mobile</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Reason</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Requested</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((row) => (
                  <tr key={row._id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-neutral-900">{row.name}</td>
                    <td className="px-4 py-3 text-neutral-700">{row.phone}</td>
                    <td className="px-4 py-3 text-neutral-700">{row.reason || '—'}</td>
                    <td className="px-4 py-3 text-neutral-600">{formatDate(row.requestedAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={busyId === row._id}
                        onClick={() => void onDelete(row)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="mt-8 text-lg font-bold text-neutral-900">Suspicious referrals</h2>
      <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-sm text-neutral-500">Loading…</p>
        ) : alerts.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">No duplicate or burst referrals recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/80">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">When</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Type</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Referrer</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Reused number</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Code</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Detail</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((row) => (
                  <tr key={row._id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3 text-neutral-600">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-neutral-900">{alertLabel(row.type)}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      {row.referrerPhone}
                      <span className="ml-1 text-xs text-neutral-400">{row.referrerKind}</span>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{row.referredPhone || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-700">{row.referralCode || '—'}</td>
                    <td className="px-4 py-3 text-neutral-600">{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
