import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Eye, FileText, Image as ImageIcon, RefreshCw, X } from 'lucide-react';
import {
  approveReceiver,
  fetchKycStats,
  fetchReceiversPage,
  rejectReceiver,
  type ReceiverRecord,
} from '../api/client';
import { ReceiverDetailModal } from '../components/ReceiverDetailModal';
import { kycCode } from '../utils/receiverDisplay';
import { resolveAdminProfileImageUrl } from '../utils/resolveProfileImageUrl';

type Tab = 'all' | 'approved' | 'pending';
type Range = '7d' | '30d' | 'all';

const PAGE_SIZE = 20;

function kycStatus(tab: Tab): 'all' | 'kyc_approved' | 'kyc_pending' {
  if (tab === 'approved') return 'kyc_approved';
  if (tab === 'pending') return 'kyc_pending';
  return 'all';
}

function formatSubmitted(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

function statusBadge(status: string) {
  if (status === 'approved') return { label: 'Approved', className: 'bg-emerald-100 text-emerald-800' };
  if (status === 'pending_review')
    return { label: 'Pending review', className: 'bg-amber-100 text-amber-800' };
  if (status === 'pending_profile')
    return { label: 'Profile incomplete', className: 'bg-sky-100 text-sky-800' };
  if (status === 'rejected') return { label: 'Rejected', className: 'bg-red-100 text-red-800' };
  return { label: status.replace(/_/g, ' '), className: 'bg-neutral-100 text-neutral-700' };
}

function canApproveReceiver(r: ReceiverRecord): boolean {
  return r.accountStatus === 'pending_review' || r.accountStatus === 'rejected' || r.accountStatus === 'approved';
}

function canRejectReceiver(r: ReceiverRecord): boolean {
  return r.accountStatus === 'pending_review' || r.accountStatus === 'approved';
}

function activityIso(r: ReceiverRecord): string {
  return r.updatedAt || r.createdAt;
}

export function KycApprovalsPage() {
  const [rows, setRows] = useState<ReceiverRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pending');
  const [range, setRange] = useState<Range>('7d');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [tabCounts, setTabCounts] = useState({ all: 0, approved: 0, pending: 0 });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReceiverRecord | null>(null);
  const [stats, setStats] = useState<{
    pendingApprovals: number;
    pendingCallerApprovals: number;
    approvedToday: number;
    rejectedToday: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, st] = await Promise.all([
        fetchReceiversPage({ status: kycStatus(tab), range, page, limit: PAGE_SIZE }),
        fetchKycStats(),
      ]);
      setRows(data.receivers);
      setTotal(data.total);
      setTabCounts({
        all: data.tabCounts.all,
        approved: data.tabCounts.kycApproved ?? data.tabCounts.approved,
        pending: data.tabCounts.kycPending ?? data.tabCounts.pending,
      });
      setStats(st);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Failed to load';
      setError(msg || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tab, range, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ta = new Date(activityIso(a)).getTime();
      const tb = new Date(activityIso(b)).getTime();
      return tb - ta;
    });
  }, [rows]);

  const onApprove = async (id: string) => {
    setBusyId(id);
    try {
      await approveReceiver(id);
      await load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Approve failed';
      setError(msg);
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (id: string) => {
    const reasonInput = window.prompt(
      'Enter rejection reason (will be shown to receiver):',
      'KYC details are unclear. Please upload clear Aadhaar/PAN images and resubmit.'
    );
    if (reasonInput === null) return;
    const reason = reasonInput.trim();
    if (!reason) {
      setError('Rejection reason is required');
      return;
    }
    setBusyId(id);
    try {
      await rejectReceiver(id, reason);
      await load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Reject failed';
      setError(msg);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">KYC Approvals</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Review receiver documents and voice samples here before approving access.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={range}
            onChange={(e) => {
              setRange(e.target.value as Range);
              setPage(1);
            }}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 shadow-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
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

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Pending (receivers)</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">{stats?.pendingApprovals ?? '—'}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Pending (app users)</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">{stats?.pendingCallerApprovals ?? '—'}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Approved Today</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">{stats?.approvedToday ?? '—'}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Rejected Today</p>
          <p className="mt-2 text-3xl font-bold text-red-600">{stats?.rejectedToday ?? '—'}</p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {(
          [
            ['all', 'All', tabCounts.all],
            ['approved', 'Approved', tabCounts.approved],
            ['pending', 'Pending', tabCounts.pending],
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
        ) : sorted.length === 0 ? (
          <div className="p-12 text-center text-sm text-neutral-500">
            <p>No rows in this view for the selected date range.</p>
            {tab === 'pending' &&
            rows.some((r) => r.accountStatus === 'pending_profile') &&
            !rows.some((r) => r.accountStatus === 'pending_review') ? (
              <p className="mt-2 text-neutral-600">
                Receivers still completing onboarding appear under <strong className="font-semibold">All</strong> as
                &quot;Profile incomplete&quot; until they submit KYC for review.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/80">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">KYC ID</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Receiver name
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Audio</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Last activity
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Documents</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const badge =
                    r.accountStatus === 'approved' && !r.isVerified
                      ? { label: 'Pending verification', className: 'bg-amber-100 text-amber-800' }
                      : statusBadge(r.accountStatus);
                  const canApprove = canApproveReceiver(r);
                  const canReject = canRejectReceiver(r);
                  const activity = activityIso(r);
                  const documentUrls = (r.documents ?? []).filter(
                    (x): x is string => typeof x === 'string' && x.trim().length > 0
                  );
                  const knownDocumentUrls = new Set(
                    [r.profileImage, r.aadhaarFront, r.aadhaarBack].filter(Boolean) as string[]
                  );
                  const panFallbackFromDocuments =
                    documentUrls.find((url) => !knownDocumentUrls.has(url)) ?? null;
                  const profileDocUrl = resolveAdminProfileImageUrl(r.profileImage, r.updatedAt);
                  const docs = [
                    profileDocUrl ? { label: 'Profile', url: profileDocUrl, Icon: ImageIcon } : null,
                    r.aadhaarFront ? { label: 'Aadhaar front', url: r.aadhaarFront, Icon: FileText } : null,
                    r.aadhaarBack ? { label: 'Aadhaar back', url: r.aadhaarBack, Icon: FileText } : null,
                    (r.panFront ?? panFallbackFromDocuments)
                      ? { label: 'PAN front', url: r.panFront ?? panFallbackFromDocuments!, Icon: FileText }
                      : { label: 'PAN front', url: null, Icon: FileText },
                  ].filter(Boolean) as { label: string; url: string; Icon: typeof FileText }[];

                  return (
                    <tr key={r._id} className="border-b border-neutral-100 last:border-0">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-neutral-800">{kycCode(i)}</td>
                      <td className="px-4 py-3 font-medium text-neutral-900">{r.name}</td>
                      <td className="px-4 py-3">
                        {r.userAudio ? (
                          <audio controls preload="none" src={r.userAudio} className="h-9 max-w-[220px]" />
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{formatSubmitted(activity)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {docs.length === 0 ? (
                            <span className="text-neutral-400">—</span>
                          ) : (
                            docs.map((d) => (
                              d.url ? (
                                <a
                                  key={d.label}
                                  href={d.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100"
                                  title={d.label}
                                >
                                  <d.Icon className="h-4 w-4" />
                                </a>
                              ) : (
                                <span
                                  key={d.label}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100 text-neutral-300"
                                  title={`${d.label} not uploaded`}
                                >
                                  <d.Icon className="h-4 w-4" />
                                </span>
                              )
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setDetail(r)}
                            className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                            title="View"
                          >
                            <Eye className="h-5 w-5" />
                          </button>
                          {canApprove || canReject ? (
                            <>
                              {canApprove ? (
                                <button
                                  type="button"
                                  disabled={busyId === r._id}
                                  onClick={() => void onApprove(r._id)}
                                  className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                                  title="Approve"
                                >
                                  <Check className="h-5 w-5" />
                                </button>
                              ) : null}
                              {canReject ? (
                                <button
                                  type="button"
                                  disabled={busyId === r._id}
                                  onClick={() => void onReject(r._id)}
                                  className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                                  title="Reject"
                                >
                                  <X className="h-5 w-5" />
                                </button>
                              ) : null}
                            </>
                          ) : null}
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

      <ReceiverDetailModal receiver={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
