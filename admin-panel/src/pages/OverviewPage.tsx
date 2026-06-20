import { IndianRupee, Phone, UserCheck, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchOverviewDashboard, type OverviewDashboardResponse } from '../api/client';

function inr(v: number): string {
  const safe = Number.isFinite(v) ? Math.max(0, v) : 0;
  return `₹${safe.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function OverviewPage() {
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [data, setData] = useState<OverviewDashboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchOverviewDashboard({ range });
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const rangeLabel =
    range === 'all' ? 'All time' : range === '30d' ? 'Last 30 days' : 'Last 7 days';

  const cards = useMemo(
    () => [
      {
        label: 'Total Revenue',
        value: data ? inr(data.cards.totalRevenue) : '…',
        note: data
          ? `${rangeLabel} · Admin ${inr(data.cards.adminEarnings)} + Receiver ${inr(data.cards.receiverEarningsSum ?? data.cards.receiverRevenue)}`
          : rangeLabel,
        icon: IndianRupee,
        tone: 'text-violet-600',
      },
      {
        label: 'Total Calls',
        value: data ? data.cards.totalCalls.toLocaleString('en-IN') : '…',
        note: rangeLabel,
        icon: Phone,
        tone: 'text-sky-600',
      },
      {
        label: 'Active Receivers',
        value: data ? data.cards.activeReceivers.toLocaleString('en-IN') : '…',
        icon: UserCheck,
        tone: 'text-emerald-600',
      },
      {
        label: 'Active Users',
        value: data ? data.cards.activeUsers.toLocaleString('en-IN') : '…',
        icon: Users,
        tone: 'text-amber-600',
      },
    ],
    [data, rangeLabel]
  );

  const maxTrend = Math.max(1, ...(data?.trend.map((t) => t.amount) ?? [1]));

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Overview</h1>
          {/* <p className="mt-1 text-sm text-neutral-500">Selecto — high-level snapshot</p> */}
        </div>
        <div className="flex gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as '7d' | '30d' | 'all')}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>
      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, note, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
                <p className="mt-2 text-2xl font-bold text-neutral-900">{value}</p>
                {note ? <p className="mt-1 text-xs text-neutral-500">{note}</p> : null}
              </div>
              <div className={`rounded-xl bg-neutral-100 p-2 ${tone}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-neutral-900">Revenue Trend (Last 7 Days)</h2>
          <div className="mt-6 flex h-40 items-end justify-between gap-2">
            {(data?.trend ?? []).map((row, idx) => (
              <div key={`${row.label}-${idx}`} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full max-w-[32px] rounded-t bg-[#ff72d2]/90"
                  style={{ height: `${Math.max(10, Math.round((row.amount / maxTrend) * 120))}px` }}
                />
                <span className="text-[10px] font-medium text-neutral-400">{row.label}</span>
              </div>
            ))}
            {loading ? <p className="text-xs text-neutral-400">Loading trend…</p> : null}
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-neutral-900">Action required</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex justify-between rounded-xl bg-amber-50 px-3 py-2">
              <span className="text-neutral-700">Pending KYC Approvals</span>
              <span className="font-bold text-amber-700">
                {data ? data.actionRequired.pendingKycApprovals : '…'}
              </span>
            </li>
            <li className="flex justify-between rounded-xl bg-sky-50 px-3 py-2">
              <span className="text-neutral-700">Pending Withdrawals</span>
              <span className="font-bold text-sky-700">
                {data ? data.actionRequired.pendingWithdrawals : '…'}
              </span>
            </li>
            <li className="flex justify-between rounded-xl bg-red-50 px-3 py-2">
              <span className="text-neutral-700">Flagged Reports</span>
              <span className="font-bold text-red-700">
                {data ? data.actionRequired.flaggedReports : '…'}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
