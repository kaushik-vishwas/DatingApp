import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Download, Edit2, RefreshCw, Search, X } from 'lucide-react';
import {
  approveAppUser,
  fetchAppUsers,
  updateAppUserSuspension,
  type AppUserRange,
  type AppUserRecord,
  type AppUserStatusTab,
} from '../api/client';
import { AppUserDetailModal } from '../components/AppUserDetailModal';
import { AppUserEditModal } from '../components/AppUserEditModal';
import { appUserRowCode, formatJoinedDate, formatPhoneIN } from '../utils/userDisplay';

const PAGE_SIZE = 20;

function downloadCsv(filename: string, rows: string[][]) {
  const esc = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
  const body = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AppUsersPage() {
  const [tab, setTab] = useState<AppUserStatusTab>('all');
  const [range, setRange] = useState<AppUserRange>('7d');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<AppUserRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [tabCounts, setTabCounts] = useState({ all: 0, active: 0, suspended: 0 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AppUserRecord | null>(null);
  const [editUser, setEditUser] = useState<AppUserRecord | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [tab, range, debouncedSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAppUsers({
        status: tab,
        q: debouncedSearch || undefined,
        range,
        page,
        limit: PAGE_SIZE,
      });
      setUsers(data.users);
      setTotal(data.total);
      setLimit(data.limit);
      setTabCounts(data.tabCounts);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Failed to load users';
      setError(msg || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tab, debouncedSearch, range, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const onExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const collected: AppUserRecord[] = [];
      let p = 1;
      let lastTotal = 0;
      do {
        const data = await fetchAppUsers({
          status: tab,
          q: debouncedSearch || undefined,
          range,
          page: p,
          limit: 100,
        });
        lastTotal = data.total;
        collected.push(...data.users);
        p += 1;
      } while (collected.length < lastTotal && p <= 60);

      const header = ['User ID', 'Name', 'Email', 'Phone', 'Wallet (INR)', 'Voice URL', 'Access', 'Profile status', 'Joined'];
      const rows: string[][] = [header];
      collected.forEach((u, i) => {
        const access = u.suspended ? 'Suspended' : 'Active';
        rows.push([
          `U${String(i + 1).padStart(4, '0')}`,
          u.name,
          u.email ?? '',
          formatPhoneIN(u.phone),
          String(u.walletBalance),
          u.userAudio ?? '',
          access,
          u.accountStatus,
          formatJoinedDate(u.createdAt),
        ]);
      });
      downloadCsv(`nesthama-users-${tab}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Export failed';
      setError(msg || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const onApproveUser = async (u: AppUserRecord) => {
    setBusyId(u._id);
    setError(null);
    try {
      await approveAppUser(u._id);
      await load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Approve failed';
      setError(msg || 'Approve failed');
    } finally {
      setBusyId(null);
    }
  };

  const onSetSuspended = async (u: AppUserRecord, suspended: boolean) => {
    if (suspended && !window.confirm(`Suspend ${u.name}? They will lose app access until you restore them.`)) return;
    setBusyId(u._id);
    setError(null);
    try {
      await updateAppUserSuspension(u._id, suspended);
      await load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message)
          : suspended
            ? 'Suspend failed'
            : 'Restore failed';
      setError(msg || 'Request failed');
    } finally {
      setBusyId(null);
    }
  };

  const pageNums = useMemo(() => {
    const nums: number[] = [];
    const windowSize = 3;
    let start = Math.max(1, page - 1);
    let end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    for (let i = start; i <= end; i += 1) nums.push(i);
    return nums;
  }, [page, totalPages]);

  const fromRow = total === 0 ? 0 : (page - 1) * limit + 1;
  const toRow = Math.min(page * limit, total);

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">User Management</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Selecto app users — search, filter, export. Status matches access: Active (not suspended) or Inactive
            (suspended). ✓ approve or restore; ✕ suspend.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as AppUserRange)}
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
              placeholder="Search…"
              className="w-52 rounded-xl border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm outline-none ring-[#7b2cff]/20 focus:ring-2 md:w-64"
            />
          </div>
          <button
            type="button"
            disabled={exporting}
            onClick={() => void onExport()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#7b2cff] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#6a24df] disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
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

      <div className="mt-8 flex flex-wrap gap-2">
        {(
          [
            ['all', 'All Users', tabCounts.all],
            ['active', 'Active', tabCounts.active],
            ['suspended', 'Suspended', tabCounts.suspended],
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
        ) : users.length === 0 ? (
          <p className="p-12 text-center text-sm text-neutral-500">No users in this view.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/80">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">User ID</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Email</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Phone</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Wallet</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Audio</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => {
                  const pending = u.accountStatus === 'pending_review';
                  const rejected = u.accountStatus === 'rejected';
                  const legacyNeedVoice = pending || rejected;
                  /** Active / Inactive = suspension only (✓ enable vs ✕ pause). */
                  const statusBadge = u.suspended
                    ? { label: 'Inactive', className: 'bg-neutral-300 text-neutral-900' }
                    : { label: 'Active', className: 'bg-emerald-100 text-emerald-800' };

                  const canTickEnable =
                    (u.suspended || legacyNeedVoice) && (!legacyNeedVoice || Boolean(u.userAudio));
                  const tickTitle = canTickEnable
                    ? 'Enable access'
                    : legacyNeedVoice && !u.userAudio
                      ? 'Cannot enable without voice sample'
                      : 'No action';

                  const canCrossSuspend = !u.suspended && u.accountStatus !== 'pending_profile';
                  const crossTitle = canCrossSuspend ? 'Suspend access' : 'Already suspended';

                  return (
                    <tr
                      key={u._id}
                      className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50/80"
                      onClick={() => setDetail(u)}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-medium text-neutral-800">
                        {appUserRowCode(page, limit, i)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-neutral-900">{u.name}</p>
                        <p className="text-xs text-neutral-500">Joined {formatJoinedDate(u.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{u.email ?? '—'}</td>
                      <td className="px-4 py-3 text-neutral-700">{formatPhoneIN(u.phone)}</td>
                      <td className="px-4 py-3 font-medium text-neutral-900">
                        ₹{u.walletBalance.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                        {u.userAudio ? (
                          <audio
                            className="h-9 w-full max-w-[240px] min-w-[180px]"
                            controls
                            preload="metadata"
                            src={u.userAudio}
                          >
                            <track kind="captions" />
                          </audio>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <span
                          className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge.className}`}
                        >
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditUser(u)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#e9ddff] bg-[var(--color-brand-muted)] text-[#7b2cff] shadow-sm hover:bg-[#ede5ff]"
                            title="Edit user"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={busyId === u._id || !canTickEnable}
                            onClick={() => {
                              if (canTickEnable) void onApproveUser(u);
                            }}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                            title={tickTitle}
                          >
                            <Check className="h-5 w-5 stroke-[2.5]" />
                          </button>
                          <button
                            type="button"
                            disabled={busyId === u._id || !canCrossSuspend}
                            onClick={() => void onSetSuspended(u, true)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-red-200 bg-red-50 text-red-700 shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                            title={crossTitle}
                          >
                            <X className="h-5 w-5 stroke-[2.5]" />
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

      <div className="mt-4 flex flex-col items-center justify-between gap-3 text-sm text-neutral-600 sm:flex-row">
        <p>
          Showing {fromRow} to {toRow} of {total} users
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-neutral-200 p-2 hover:bg-neutral-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pageNums.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              className={`min-w-[2.25rem] rounded-lg px-2 py-1 font-semibold ${
                n === page ? 'bg-[var(--color-brand-muted)] text-[#7b2cff]' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-neutral-200 p-2 hover:bg-neutral-50 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AppUserDetailModal
        user={detail}
        onClose={() => setDetail(null)}
        onChanged={() => void load()}
        onEdit={(u) => {
          setDetail(null);
          setEditUser(u);
        }}
      />
      <AppUserEditModal user={editUser} onClose={() => setEditUser(null)} onSaved={() => void load()} />
    </div>
  );
}
