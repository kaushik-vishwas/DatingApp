import { Eye } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchModerationReports,
  resolveModerationReport,
  type ModerationReportRow,
  type ModerationReportStats,
} from '../api/client';

const emptyStats: ModerationReportStats = {
  pendingReports: 0,
  resolvedToday: 0,
  usersWarned: 0,
  usersSuspended: 0,
};

const reasonClass = (reason: string) => {
  if (reason === 'Spam') return 'bg-red-50 text-red-700';
  if (reason === 'Harassment') return 'bg-orange-50 text-orange-700';
  if (reason === 'Inappropriate content') return 'bg-rose-50 text-rose-700';
  if (reason === 'Fake profile') return 'bg-violet-50 text-violet-700';
  if (reason === 'Call session issue') return 'bg-amber-50 text-amber-800';
  return 'bg-neutral-100 text-neutral-700';
};

const statusClass = (status: string) =>
  status === 'resolved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ReportsPage() {
  const [stats, setStats] = useState<ModerationReportStats>(emptyStats);
  const [rows, setRows] = useState<ModerationReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<ModerationReportRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchModerationReports({ q, status: 'all', page: 1 });
      setStats(data.stats);
      setRows(data.reports);
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : 'Failed to load';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  const onAction = async (id: string, action: 'ignore' | 'warn' | 'suspend') => {
    setBusyId(id);
    setError(null);
    try {
      await resolveModerationReport(id, action);
      await load();
      setDetail((d) => (d && d._id === id ? null : d));
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Request failed')
          : 'Action failed';
      setError(msg);
    } finally {
      setBusyId(null);
    }
  };

  const cards = [
    { label: 'Pending Reports', value: String(stats.pendingReports), tone: 'text-amber-600' },
    { label: 'Resolved Today', value: String(stats.resolvedToday), tone: 'text-emerald-600' },
    { label: 'Warn actions (total)', value: String(stats.usersWarned), tone: 'text-orange-600' },
    { label: 'Suspend actions (total)', value: String(stats.usersSuspended), tone: 'text-red-600' },
  ];

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-neutral-900">Reports &amp; Moderation</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void load()}
            placeholder="Search…"
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-violet-400"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Search
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium text-neutral-500">{card.label}</p>
            <p className={`mt-1.5 text-3xl font-bold ${card.tone}`}>{loading ? '…' : card.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Report ID</th>
                <th className="px-3 py-2">Reporter</th>
                <th className="px-3 py-2">Reported user</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Preview</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="border-t border-neutral-100">
                  <td className="px-3 py-2.5 font-medium text-neutral-700">{row.reportId}</td>
                  <td className="px-3 py-2.5 text-neutral-700">{row.reporterName}</td>
                  <td className="px-3 py-2.5 text-neutral-700">{row.reportedName}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${reasonClass(row.reason)}`}>
                      {row.reason}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2.5 text-neutral-500">{row.preview}</td>
                  <td className="px-3 py-2.5 text-neutral-500">{formatDate(row.createdAt)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(row.status)}`}>
                      {row.status === 'pending' ? 'Pending' : 'Resolved'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        title="View"
                        onClick={() => setDetail(row)}
                        className="rounded p-1 text-neutral-500 hover:bg-neutral-100"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row._id}
                        onClick={() => void onAction(row._id, 'warn')}
                        className="rounded bg-orange-50 px-1.5 py-1 text-[10px] font-semibold text-orange-700 disabled:opacity-50"
                      >
                        Warn
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row._id}
                        onClick={() => void onAction(row._id, 'suspend')}
                        className="rounded bg-red-50 px-1.5 py-1 text-[10px] font-semibold text-red-700 disabled:opacity-50"
                      >
                        Suspend
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row._id}
                        onClick={() => void onAction(row._id, 'ignore')}
                        className="rounded bg-neutral-100 px-1.5 py-1 text-[10px] font-semibold text-neutral-600 disabled:opacity-50"
                      >
                        Ignore
                      </button>
                      {row.status === 'resolved' ? (
                        <span className="text-[10px] font-medium text-neutral-400">
                          {row.resolution ? `Current: ${row.resolution}` : 'Current: resolved'}
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-neutral-500">No reports yet.</p>
          ) : null}
        </div>
      </div>

      {detail ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() => setDetail(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-neutral-900">{detail.reportId}</h2>
            <p className="mt-2 text-sm text-neutral-600">
              <span className="font-semibold">Reporter:</span> {detail.reporterName}
            </p>
            <p className="text-sm text-neutral-600">
              <span className="font-semibold">Reported:</span> {detail.reportedName}
            </p>
            <p className="text-sm text-neutral-600">
              <span className="font-semibold">Reason:</span> {detail.reason}
            </p>
            <p className="mt-2 text-sm text-neutral-700">
              <span className="font-semibold">Preview:</span> {detail.preview}
            </p>
            <p className="mt-1 text-xs text-neutral-500">{formatDate(detail.createdAt)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800"
                onClick={() => void onAction(detail._id, 'warn')}
              >
                Warn
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800"
                onClick={() => void onAction(detail._id, 'suspend')}
              >
                Suspend
              </button>
              <button
                type="button"
                className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-700"
                onClick={() => void onAction(detail._id, 'ignore')}
              >
                Ignore
              </button>
            </div>
            {detail.status === 'resolved' ? (
              <p className="mt-2 text-xs text-neutral-500">
                {detail.resolution ? `Current resolution: ${detail.resolution}` : 'Current resolution: resolved'}
              </p>
            ) : null}
            <button
              type="button"
              className="mt-4 w-full rounded-lg border border-neutral-200 py-2 text-sm font-semibold text-neutral-700"
              onClick={() => setDetail(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
