import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Eye, Mic, RefreshCw, Search, Star, Trash2 } from 'lucide-react';
import {
  deleteReceiverPermanently,
  fetchReceiversPage,
  type ReceiverRecord,
} from '../api/client';
import { ReceiverDetailModal } from '../components/ReceiverDetailModal';
import { ReceiverEditModal } from '../components/ReceiverEditModal';
import {
  formatINR,
  receiverAvailabilityState,
  receiverCode,
  receiverIsLiveAvailable,
  receiverRatingDisplay,
  receiverVoiceVerificationSucceeded,
} from '../utils/receiverDisplay';

type Tab = 'all' | 'approved' | 'pending' | 'rejected';
type ReceiverRange = '7d' | '30d' | 'all';

const PAGE_SIZE = 20;

function kycLabel(status: string): { label: string; className: string } {
  if (status === 'approved') return { label: 'Approved', className: 'bg-emerald-100 text-emerald-800' };
  if (status === 'pending_review')
    return { label: 'Pending review', className: 'bg-amber-100 text-amber-800' };
  if (status === 'pending_profile')
    return { label: 'Profile incomplete', className: 'bg-sky-100 text-sky-800' };
  if (status === 'rejected') return { label: 'Rejected', className: 'bg-red-100 text-red-800' };
  return { label: status.replace(/_/g, ' '), className: 'bg-neutral-100 text-neutral-700' };
}

export function ReceiversPage() {
  const [rows, setRows] = useState<ReceiverRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [range, setRange] = useState<ReceiverRange>('7d');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [tabCounts, setTabCounts] = useState({ all: 0, approved: 0, pending: 0, rejected: 0 });
  const [detail, setDetail] = useState<ReceiverRecord | null>(null);
  const [editReceiver, setEditReceiver] = useState<ReceiverRecord | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReceiversPage({
        status: tab,
        q: debouncedSearch || undefined,
        range,
        page,
        limit: PAGE_SIZE,
      });
      setRows(data.receivers);
      setTotal(data.total);
      setTabCounts(data.tabCounts);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Failed to load receivers';
      setError(msg || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tab, debouncedSearch, range, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [search]);

  const onDeletePermanently = async (r: ReceiverRecord) => {
    if (
      !window.confirm(
        `Permanently delete ${r.name}? This removes chats, call sessions, daily scores, ratings, notifications, withdrawals, and reports. Referral reward history is kept. This cannot be undone.`
      )
    ) {
      return;
    }
    setBusyId(r._id);
    setError(null);
    try {
      await deleteReceiverPermanently(r._id);
      if (detail?._id === r._id) setDetail(null);
      if (editReceiver?._id === r._id) setEditReceiver(null);
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const stats = useMemo(() => {
    let online = 0;
    let voiceVerified = 0;
    let ratingWeightedSum = 0;
    let ratingWeightedN = 0;
    for (const r of rows) {
      if (receiverIsLiveAvailable(r)) online += 1;
      if (receiverVoiceVerificationSucceeded(r)) voiceVerified += 1;
      if (r.accountStatus === 'approved' && typeof r.ratingAvg === 'number' && (r.ratingCount ?? 0) > 0) {
        const count = r.ratingCount ?? 0;
        ratingWeightedSum += r.ratingAvg * count;
        ratingWeightedN += count;
      }
    }
    const avgRating =
      ratingWeightedN > 0 ? Math.round((ratingWeightedSum / ratingWeightedN) * 10) / 10 : null;
    return {
      total: tabCounts.all,
      online,
      pendingKyc: tabCounts.pending,
      rejected: tabCounts.rejected,
      voiceVerified,
      avgRating,
    };
  }, [rows, tabCounts]);

  const rangeLabel = range === 'all' ? 'All time' : range === '30d' ? 'Last 30 days' : 'Last 7 days';

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Receiver Management</h1>
          <p className="mt-1 text-sm text-neutral-500">
            View receivers, KYC status, and activity. Approve or reject from the KYC Approvals page.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={range}
            onChange={(e) => {
              setRange(e.target.value as ReceiverRange);
              setPage(1);
            }}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 shadow-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email…"
              className="w-52 rounded-xl border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm outline-none ring-[#7b2cff]/20 focus:ring-2 md:w-64"
            />
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
      </div>

      {error ? (
        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Total Receivers</p>
          <p className="mt-2 text-3xl font-bold text-neutral-900">{stats.total}</p>
          <p className="mt-1 text-xs text-neutral-400">{rangeLabel}{debouncedSearch ? ' · filtered' : ''}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Online Now</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">{stats.online}</p>
          <p className="mt-1 text-xs text-neutral-400">On this page</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Pending KYC</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">{stats.pendingKyc}</p>
          <p className="mt-1 text-xs text-neutral-400">Review + profile incomplete</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Rejected</p>
          <p className="mt-2 text-3xl font-bold text-red-600">{stats.rejected}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Voice Verified</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-3xl font-bold text-violet-600">{stats.voiceVerified}</p>
            <Mic className="h-7 w-7 text-violet-500" />
          </div>
          <p className="mt-1 text-xs text-neutral-400">On this page</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Avg Rating</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-3xl font-bold text-neutral-900">{stats.avgRating ?? '—'}</p>
            {stats.avgRating != null ? <Star className="h-7 w-7 fill-amber-400 text-amber-400" /> : null}
          </div>
          <p className="mt-1 text-xs text-neutral-400">On this page</p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {(
          [
            ['all', 'All Receivers', tabCounts.all],
            ['approved', 'Approved', tabCounts.approved],
            ['pending', 'Pending KYC', tabCounts.pending],
            ['rejected', 'Rejected', tabCounts.rejected],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setPage(1);
            }}
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
        ) : rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-neutral-500">
            {debouncedSearch || range !== 'all'
              ? 'No receivers match your search or date filter.'
              : 'No receivers in this view.'}
          </p>
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
                    Mobile Number
                  </th>
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
                {rows.map((r, i) => {
                  const idx = (page - 1) * PAGE_SIZE + i;
                  const kyc = kycLabel(r.accountStatus);
                  const availability = receiverAvailabilityState(r);
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
                        {r.accountDeletionRequestedAt ? (
                          <p className="text-xs font-semibold text-red-600">Delete requested</p>
                        ) : null}
                        <p className="text-xs text-neutral-500">
                          {callsToday} calls today · {totalCalls} total
                        </p>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{r.phone}</td>
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
                            className={`h-2 w-2 rounded-full ${
                              availability === 'online'
                                ? 'bg-emerald-500'
                                : availability === 'busy'
                                  ? 'bg-amber-500'
                                  : 'bg-neutral-300'
                            }`}
                          />
                          <span className="text-neutral-700">
                            {availability === 'online' ? 'Online' : availability === 'busy' ? 'Busy' : 'Offline'}
                          </span>
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
                          <button
                            type="button"
                            disabled={busyId === r._id}
                            onClick={() => void onDeletePermanently(r)}
                            className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-40"
                            title="Delete permanently"
                          >
                            <Trash2 className="h-5 w-5" />
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

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
          <p>
            Page {page} of {totalPages} · {total} in this view
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

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
