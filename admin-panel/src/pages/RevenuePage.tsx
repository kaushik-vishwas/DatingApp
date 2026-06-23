import { Download } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchRevenueDashboard, type RevenueDashboardResponse } from '../api/client';

function inr(v: number): string {
  return `₹${(Math.round(v * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function RevenuePage() {
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RevenueDashboardResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchRevenueDashboard({ range });
      setData(response);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load revenue');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const rangeLabel = range === 'all' ? 'All time' : `Last ${range === '7d' ? '7' : '30'} days`;

  const statCards = useMemo(
    () => [
      {
        label: 'Gross Revenue',
        value: data ? inr(data.cards.grossRevenue) : '…',
        note: `${rangeLabel} · Caller spend on calls + chat`,
        tone: 'text-emerald-600',
      },
      {
        label: 'Platform Commission',
        value: data ? inr(data.cards.platformCommission) : '…',
        note: data
          ? `Usage ${inr(data.cards.usageCommission)} + recharge ${inr(data.cards.callerRechargeCommission)} + withdrawal ${inr(data.cards.receiverWithdrawalCommission)}`
          : 'Usage + caller recharge + receiver withdrawal fees',
        tone: 'text-[#7b2cff]',
      },
      {
        label: 'Net Payout',
        value: data ? inr(data.cards.netPayout) : '…',
        note: 'Total receiver earnings (calls + chat)',
        tone: 'text-sky-600',
      },
      {
        label: 'Platform Profit',
        value: data ? inr(data.cards.platformProfit) : '…',
        note: 'Gross revenue − net payout (usage margin)',
        tone: 'text-emerald-600',
      },
    ],
    [data, rangeLabel]
  );

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-neutral-900">Revenue Dashboard</h1>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as '7d' | '30d' | 'all')}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-600"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-[#7b2cff] px-3 py-2 text-xs font-semibold text-white">
            <Download className="h-3.5 w-3.5" />
            Export Report
          </button>
        </div>
      </div>
      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium text-neutral-500">{card.label}</p>
            <p className="mt-1.5 text-3xl font-bold text-neutral-900">{loading ? '…' : card.value}</p>
            <p className={`mt-1 text-xs font-medium leading-relaxed ${card.tone}`}>{card.note}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-bold text-neutral-800">Daily Revenue Breakdown</h2>
          <p className="mt-1 text-[11px] text-neutral-500">
            Revenue = caller spend · Commission = revenue − receiver payout · Payout = receiver earnings
          </p>
          <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Revenue (call + chat)</th>
                  <th className="px-3 py-2">Commission</th>
                  <th className="px-3 py-2">Payout</th>
                </tr>
              </thead>
              <tbody>
                {(data?.dailyBreakdown ?? []).map((row) => (
                  <tr key={row.date} className="border-t border-neutral-100">
                    <td className="px-3 py-2.5 font-medium text-neutral-700">{row.date}</td>
                    <td className="px-3 py-2.5 text-neutral-700">{inr(row.revenue)}</td>
                    <td className="px-3 py-2.5 font-semibold text-[#7b2cff]">{inr(row.commission)}</td>
                    <td className="px-3 py-2.5 font-semibold text-sky-600">{inr(row.payout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && (data?.dailyBreakdown.length ?? 0) === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-neutral-500">No revenue data for selected range.</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-bold text-neutral-800">Top Earning Receivers</h2>
          <div className="mt-3 space-y-3">
            {(data?.topEarners ?? []).map((item) => (
              <div key={item.receiverId} className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-neutral-800">{item.name}</p>
                  <p className="text-[11px] text-neutral-500">{item.calls} calls</p>
                </div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  <p>
                    Caller spend: <span className="font-medium text-neutral-700">{inr(item.earnings)}</span>
                  </p>
                  <p>
                    Receiver payout: <span className="font-semibold text-emerald-600">{inr(item.payout)}</span>
                  </p>
                </div>
              </div>
            ))}
            {!loading && (data?.topEarners.length ?? 0) === 0 ? (
              <p className="text-xs text-neutral-500">No earning receivers in selected range.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
