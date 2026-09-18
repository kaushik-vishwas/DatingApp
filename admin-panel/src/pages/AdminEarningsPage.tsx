import { IndianRupee, RefreshCw, Save, Wallet } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  fetchAdminEarningsDashboard,
  type AdminEarningsBreakdown,
  type AdminEarningsDashboardResponse,
} from '../api/client';

/** Platform earnings — usage margin plus withdrawal fees minus referral payouts. */
function earningsTotals(b: AdminEarningsBreakdown) {
  const totalRevenue = roundInr(b.totalRevenue ?? b.callerCallGross + b.callerMessageGross);
  const totalPayout = roundInr(b.totalPayout ?? b.receiverCallPayout + b.receiverMessagePayout);
  const usageMargin = roundInr(Math.max(0, totalRevenue - totalPayout));
  const withdrawalFees = roundInr(Math.max(0, b.withdrawalFeeEarnings ?? 0));
  const referralPaid = roundInr(Math.max(0, b.referralRewardsPaid ?? 0));
  const totalEarned = roundInr(Math.max(0, usageMargin + withdrawalFees - referralPaid));
  return { totalRevenue, totalPayout, usageMargin, withdrawalFees, referralPaid, totalEarned };
}

function roundInr(v: number): number {
  return Math.round(v * 100) / 100;
}

function apiErrorMessage(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    const msg = e.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return e instanceof Error ? e.message : fallback;
}

function inr(v: number): string {
  const safe = Math.max(0, v);
  return `₹${safe.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function AdminEarningsPage() {
  const [data, setData] = useState<AdminEarningsDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upiId, setUpiId] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminEarningsDashboard();
      setData(res);
      setUpiId(res.payout.upiId);
      setPayeeName(res.payout.payeeName);
      setContactPhone(res.payout.contactPhone);
    } catch (e: unknown) {
      setError(apiErrorMessage(e, 'Failed to load admin earnings'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const breakdown = useMemo(() => {
    if (!data) return null;
    return {
      lifetime: earningsTotals(data.earnings.lifetime),
      today: earningsTotals(data.earnings.today),
      thisWeek: earningsTotals(data.earnings.thisWeek),
    };
  }, [data]);

  const cards = useMemo(() => {
    if (!breakdown) return [];
    const { totalRevenue, totalPayout, totalEarned } = breakdown.lifetime;
    return [
      {
        label: 'Total Revenue',
        value: inr(totalRevenue),
        note: 'Total spend from all callers (calls + chat)',
        tone: 'text-emerald-600',
      },
      {
        label: 'Total Payout to Receivers',
        value: inr(totalPayout),
        note: 'Call + message payouts to receivers',
        tone: 'text-sky-600',
      },
      {
        label: 'Total Earned',
        value: inr(totalEarned),
        note: 'Usage margin + withdrawal fees − referral rewards',
        tone: 'text-[#7b2cff]',
      },
    ];
  }, [breakdown]);

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Admin Earnings & Withdraw</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Total earned = (caller spend − receiver payout) + withdrawal fees − referral rewards paid.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-600"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ label, value, note, tone }) => (
          <div key={label} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
                <p className="mt-2 text-2xl font-bold text-neutral-900">{loading ? '…' : value}</p>
                <p className="mt-1 text-xs text-neutral-500">{note}</p>
              </div>
              <div className={`rounded-xl bg-neutral-100 p-2 ${tone}`}>
                <IndianRupee className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {data ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-bold text-neutral-900">Earnings Breakdown (lifetime)</h2>
            <div className="mt-4 space-y-3 text-sm">
              {breakdown ? (
                <>
              <div className="flex justify-between">
                <span className="text-neutral-600">Total revenue (caller spend)</span>
                <span className="font-semibold text-neutral-900">{inr(breakdown.lifetime.totalRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Total payout to receivers</span>
                <span className="font-semibold text-sky-700">−{inr(breakdown.lifetime.totalPayout)}</span>
              </div>
              <div className="flex justify-between border-t border-neutral-100 pt-3">
                <span className="text-neutral-600">Earned from usage (calls + chat)</span>
                <span className="font-semibold text-neutral-800">{inr(breakdown.lifetime.usageMargin)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Withdrawal fees (extra)</span>
                <span
                  className={`font-semibold ${breakdown.lifetime.withdrawalFees > 0 ? 'text-emerald-700' : 'text-neutral-400'}`}
                >
                  {breakdown.lifetime.withdrawalFees > 0 ? '+' : ''}
                  {inr(breakdown.lifetime.withdrawalFees)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Referral rewards paid</span>
                <span
                  className={`font-semibold ${breakdown.lifetime.referralPaid > 0 ? 'text-red-600' : 'text-neutral-400'}`}
                >
                  {breakdown.lifetime.referralPaid > 0 ? '−' : ''}
                  {inr(breakdown.lifetime.referralPaid)}
                </span>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-3">
                <span className="font-semibold text-neutral-800">Total earned</span>
                <span className="font-bold text-[#7b2cff]">{inr(breakdown.lifetime.totalEarned)}</span>
              </div>
              <div className="flex justify-between pt-2 text-xs text-neutral-500">
                <span>Today earned</span>
                <span>
                  {inr(breakdown.today.totalEarned)} · {data.earnings.today.calls} calls ·{' '}
                  {data.earnings.today.messages} msgs
                </span>
              </div>
              <div className="flex justify-between text-xs text-neutral-500">
                <span>This week earned</span>
                <span>
                  {inr(breakdown.thisWeek.totalEarned)} · {data.earnings.thisWeek.calls} calls ·{' '}
                  {data.earnings.thisWeek.messages} msgs
                </span>
              </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="space-y-6">
            <div
              className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-sm opacity-60"
              aria-disabled="true"
            >
              <h2 className="text-sm font-bold text-neutral-400">UPI Payout Details</h2>
              <p className="mt-1 text-xs text-neutral-400">Used for RazorpayX admin withdrawals</p>
              <div className="pointer-events-none mt-4 space-y-3 select-none">
                <label className="block text-xs font-semibold text-neutral-400">
                  UPI ID
                  <input
                    value={upiId}
                    readOnly
                    disabled
                    placeholder="name@bank"
                    className="mt-1 w-full cursor-not-allowed rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-400"
                  />
                </label>
                <label className="block text-xs font-semibold text-neutral-400">
                  Name as per UPI
                  <input
                    value={payeeName}
                    readOnly
                    disabled
                    placeholder="Account holder name"
                    className="mt-1 w-full cursor-not-allowed rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-400"
                  />
                </label>
                <label className="block text-xs font-semibold text-neutral-400">
                  Contact mobile (Razorpay)
                  <input
                    value={contactPhone}
                    readOnly
                    disabled
                    placeholder="10-digit mobile"
                    className="mt-1 w-full cursor-not-allowed rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-400"
                  />
                </label>
                <button
                  type="button"
                  disabled
                  className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-500"
                >
                  <Save className="h-4 w-4" />
                  Save UPI Details
                </button>
              </div>
            </div>

            <div
              className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-sm opacity-60"
              aria-disabled="true"
            >
              <h2 className="text-sm font-bold text-neutral-400">Withdraw Earnings</h2>
              <p className="mt-1 text-xs text-neutral-400">
                Withdrawable: {inr(data.earnings.withdrawableInr)}
              </p>
              <div className="pointer-events-none mt-4 flex gap-2 select-none">
                <input
                  readOnly
                  disabled
                  type="number"
                  placeholder="Amount in INR"
                  className="w-full cursor-not-allowed rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-400"
                />
                <button
                  type="button"
                  disabled
                  className="inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg bg-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-500"
                >
                  <Wallet className="h-4 w-4" />
                  Withdraw
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className="mt-8 rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-sm opacity-60"
        aria-disabled="true"
      >
        <h2 className="text-sm font-bold text-neutral-400">Withdrawal History</h2>
        <div className="pointer-events-none mt-4 select-none overflow-x-auto">
          <table className="min-w-full text-left text-sm text-neutral-400">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-400">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Amount</th>
                <th className="px-2 py-2">UPI</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">UTR</th>
              </tr>
            </thead>
            <tbody>
              {(data?.withdrawals ?? []).map((row) => (
                <tr key={row.id} className="border-b border-neutral-100">
                  <td className="px-2 py-3">{new Date(row.createdAt).toLocaleString('en-IN')}</td>
                  <td className="px-2 py-3 font-semibold">{inr(row.amount)}</td>
                  <td className="px-2 py-3">{row.upiId}</td>
                  <td className="px-2 py-3">
                    <span className="rounded-full bg-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-500">
                      {row.payoutStatus}
                    </span>
                  </td>
                  <td className="px-2 py-3">{row.payoutUtr ?? '—'}</td>
                </tr>
              ))}
              {!loading && (data?.withdrawals.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-neutral-400">
                    No admin withdrawals yet
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
