import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Eye, RefreshCw, Star } from 'lucide-react';
import { fetchAllReceivers, type ReceiverRecord } from '../api/client';
import { ReceiverDetailModal } from '../components/ReceiverDetailModal';
import { ReceiverEditModal } from '../components/ReceiverEditModal';
import { formatINR, receiverIsLiveAvailable, receiverRatingDisplay, receiverCode } from '../utils/receiverDisplay';

type Tab = 'all' | 'approved' | 'pending';

function kycLabel(status: string): { label: string; className: string } {
  if (status === 'approved') return { label: 'Approved', className: 'bg-emerald-100 text-emerald-800' };
  if (status === 'pending_review')
    return { label: 'Pending', className: 'bg-amber-100 text-amber-800' };
  if (status === 'rejected') return { label: 'Rejected', className: 'bg-red-100 text-red-800' };
  return { label: status.replace(/_/g, ' '), className: 'bg-neutral-100 text-neutral-700' };
}

export function ReceiversPage() {
  const [rows, setRows] = useState<ReceiverRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [detail, setDetail] = useState<ReceiverRecord | null>(null);
  const [editReceiver, setEditReceiver] = useState<ReceiverRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchAllReceivers();
      setRows(list);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Failed to load receivers';
      setError(msg || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ca - cb;
    });
  }, [rows]);

  const idIndex = useMemo(() => {
    const m = new Map<string, number>();
    sorted.forEach((r, i) => m.set(r._id, i));
    return m;
  }, [sorted]);

  const filtered = useMemo(() => {
    if (tab === 'approved') return sorted.filter((r) => r.accountStatus === 'approved');
    if (tab === 'pending') return sorted.filter((r) => r.accountStatus === 'pending_review');
    return sorted;
  }, [sorted, tab]);

  const stats = useMemo(() => {
    const total = sorted.length;
    const pendingKyc = sorted.filter((r) => r.accountStatus === 'pending_review').length;
    let online = 0;
    let ratingWeightedSum = 0;
    let ratingWeightedN = 0;
    for (const r of sorted) {
      if (receiverIsLiveAvailable(r)) online += 1;
      if (r.accountStatus === 'approved' && typeof r.ratingAvg === 'number' && (r.ratingCount ?? 0) > 0) {
        const count = r.ratingCount ?? 0;
        ratingWeightedSum += r.ratingAvg * count;
        ratingWeightedN += count;
      }
    }
    const avgRating =
      ratingWeightedN > 0 ? Math.round((ratingWeightedSum / ratingWeightedN) * 10) / 10 : null;
    return { total, online, pendingKyc, avgRating };
  }, [sorted]);

  const tabCounts = useMemo(
    () => ({
      all: sorted.length,
      approved: sorted.filter((r) => r.accountStatus === 'approved').length,
      pending: sorted.filter((r) => r.accountStatus === 'pending_review').length,
    }),
    [sorted]
  );

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Receiver Management</h1>
          <p className="mt-1 text-sm text-neutral-500">
            View receivers, KYC status, and activity. Approve or reject from the KYC Approvals page.
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

      {error ? (
        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Total Receivers</p>
          <p className="mt-2 text-3xl font-bold text-neutral-900">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Online Now</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">{stats.online}</p>
          <p className="mt-1 text-xs text-neutral-400">Availability on &amp; logged in</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Pending KYC</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">{stats.pendingKyc}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Avg Rating</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-3xl font-bold text-neutral-900">{stats.avgRating ?? '—'}</p>
            {stats.avgRating != null ? <Star className="h-7 w-7 fill-amber-400 text-amber-400" /> : null}
          </div>
          <p className="mt-1 text-xs text-neutral-400">From caller ratings</p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {(
          [
            ['all', 'All Receivers', tabCounts.all],
            ['approved', 'Approved', tabCounts.approved],
            ['pending', 'Pending KYC', tabCounts.pending],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              tab === key
                ? 'bg-[var(--color-brand-muted)] text-[#7b2cff]'
                : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50'
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-sm text-neutral-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-12 text-center text-sm text-neutral-500">No receivers in this view.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/80">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Receiver ID
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    KYC Status
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Earnings Today
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Total Earnings
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Rating</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Availability
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const idx = idIndex.get(r._id) ?? 0;
                  const kyc = kycLabel(r.accountStatus);
                  const live = receiverIsLiveAvailable(r);
                  const ratingLabel = receiverRatingDisplay(r);
                  const callsToday = r.callsToday ?? 0;
                  const totalCalls = r.totalCalls ?? 0;
                  const earningsToday = r.earningsToday ?? 0;
                  const totalEarnings = r.totalEarnings ?? 0;
                  return (
                    <tr key={r._id} className="border-b border-neutral-100 last:border-0">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-neutral-800">
                        {receiverCode(idx)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-neutral-900">{r.name}</p>
                        <p className="text-xs text-neutral-500">
                          {callsToday} calls today · {totalCalls} total
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${kyc.className}`}>
                          {kyc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{formatINR(earningsToday)}</td>
                      <td className="px-4 py-3 text-neutral-700">{formatINR(totalEarnings)}</td>
                      <td className="px-4 py-3">
                        {ratingLabel != null ? (
                          <span className="inline-flex items-center gap-1 font-medium text-neutral-800">
                            {ratingLabel}{' '}
                            {(r.ratingCount ?? 0) > 0 ? (
                              <span className="text-xs font-normal text-neutral-500">
                                ({r.ratingCount})
                              </span>
                            ) : null}
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          </span>
                        ) : (
                          <span className="text-neutral-400">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-500' : 'bg-neutral-300'}`}
                          />
                          <span className="text-neutral-700">{live ? 'Online' : 'Offline'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setDetail(r)}
                            className="rounded-lg p-2 text-[#7b2cff] hover:bg-[var(--color-brand-muted)]"
                            title="View"
                          >
                            <Eye className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditReceiver(r)}
                            className="rounded-lg p-2 text-[#7b2cff] hover:bg-[var(--color-brand-muted)]"
                            title="Edit"
                          >
                            <Edit2 className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReceiverDetailModal
        receiver={detail}
        onClose={() => setDetail(null)}
        onEdit={(r) => {
          setDetail(null);
          setEditReceiver(r);
        }}
      />
      <ReceiverEditModal
        receiver={editReceiver}
        onClose={() => setEditReceiver(null)}
        onSaved={() => void load()}
      />
    </div>
  );
}
