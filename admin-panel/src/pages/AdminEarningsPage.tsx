import { IndianRupee, RefreshCw, Save, Wallet } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  createAdminEarningsWithdrawal,
  fetchAdminEarningsDashboard,
  updateAdminEarningsPayoutDetails,
  type AdminEarningsDashboardResponse,
} from '../api/client';

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

const payoutStatusClass = (status: string) => {
  if (status === 'success') return 'bg-emerald-50 text-emerald-700';
  if (status === 'failed') return 'bg-red-50 text-red-700';
  return 'bg-amber-50 text-amber-700';
};

export function AdminEarningsPage() {
  const [data, setData] = useState<AdminEarningsDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upiId, setUpiId] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [savingPayout, setSavingPayout] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

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

  const cards = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: 'Total Admin Earnings',
        value: inr(data.earnings.lifetime.totalEarnings),
        note: 'Caller charges minus receiver share',
        tone: 'text-[#7b2cff]',
      },
      {
        label: 'Withdrawable',
        value: inr(data.earnings.withdrawableInr),
        note: 'Available to withdraw now',
        tone: 'text-emerald-600',
      },
      {
        label: 'Today',
        value: inr(data.earnings.today.totalEarnings),
        note: `${data.earnings.today.calls} calls · ${data.earnings.today.messages} msgs`,
        tone: 'text-sky-600',
      },
      {
        label: 'This Week',
        value: inr(data.earnings.thisWeek.totalEarnings),
        note: `${data.earnings.thisWeek.calls} calls · ${data.earnings.thisWeek.messages} msgs`,
        tone: 'text-amber-600',
      },
    ];
  }, [data]);

  const onSavePayout = async () => {
    setSavingPayout(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await updateAdminEarningsPayoutDetails({ upiId, payeeName, contactPhone });
      setSuccess(res.message);
      await load();
    } catch (e: unknown) {
      setError(apiErrorMessage(e, 'Failed to save payout details'));
    } finally {
      setSavingPayout(false);
    }
  };

  const onWithdraw = async () => {
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount < 1) {
      setError('Enter a valid withdrawal amount (minimum ₹1)');
      return;
    }
    setWithdrawing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await createAdminEarningsWithdrawal(amount);
      setSuccess(res.message);
      setWithdrawAmount('');
      await load();
    } catch (e: unknown) {
      setError(apiErrorMessage(e, 'Withdrawal failed'));
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Admin Earnings & Withdraw</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Lifetime admin share only (calls ₹5/min · messages ₹1/₹0.50). Overview Total Revenue = admin + receiver.
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
      {success ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              <div className="flex justify-between">
                <span className="text-neutral-600">Call margin</span>
                <span className="font-semibold text-neutral-900">{inr(data.earnings.lifetime.callEarnings)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Message margin</span>
                <span className="font-semibold text-neutral-900">{inr(data.earnings.lifetime.messageEarnings)}</span>
              </div>
              <div className="flex justify-between border-t border-neutral-100 pt-3">
                <span className="text-neutral-600">Caller call charges</span>
                <span className="text-neutral-800">{inr(data.earnings.lifetime.callerCallGross)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Receiver call payouts</span>
                <span className="text-neutral-800">{inr(data.earnings.lifetime.receiverCallPayout)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Caller message charges</span>
                <span className="text-neutral-800">{inr(data.earnings.lifetime.callerMessageGross)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Receiver message payouts</span>
                <span className="text-neutral-800">{inr(data.earnings.lifetime.receiverMessagePayout)}</span>
              </div>
              <div className="flex justify-between border-t border-neutral-100 pt-3">
                <span className="text-neutral-600">Already withdrawn / reserved</span>
                <span className="font-semibold text-neutral-900">{inr(data.earnings.withdrawnInr)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-bold text-neutral-900">UPI Payout Details</h2>
              <p className="mt-1 text-xs text-neutral-500">Used for RazorpayX admin withdrawals</p>
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-semibold text-neutral-600">
                  UPI ID
                  <input
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="name@bank"
                    className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-semibold text-neutral-600">
                  Name as per UPI
                  <input
                    value={payeeName}
                    onChange={(e) => setPayeeName(e.target.value)}
                    placeholder="Account holder name"
                    className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-semibold text-neutral-600">
                  Contact mobile (Razorpay)
                  <input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="10-digit mobile"
                    className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void onSavePayout()}
                  disabled={savingPayout}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#7b2cff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {savingPayout ? 'Saving…' : 'Save UPI Details'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-bold text-neutral-900">Withdraw Earnings</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Withdrawable: {inr(data.earnings.withdrawableInr)}
                {!data.payout.configured ? ' · Save UPI details first' : ''}
              </p>
              <div className="mt-4 flex gap-2">
                <input
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Amount in INR"
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void onWithdraw()}
                  disabled={withdrawing || !data.payout.configured}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Wallet className="h-4 w-4" />
                  {withdrawing ? 'Processing…' : 'Withdraw'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-neutral-900">Withdrawal History</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Amount</th>
                <th className="px-2 py-2">UPI</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">UTR</th>
              </tr>
            </thead>
            <tbody>
              {(data?.withdrawals ?? []).map((row) => (
                <tr key={row.id} className="border-b border-neutral-50">
                  <td className="px-2 py-3 text-neutral-700">
                    {new Date(row.createdAt).toLocaleString('en-IN')}
                  </td>
                  <td className="px-2 py-3 font-semibold text-neutral-900">{inr(row.amount)}</td>
                  <td className="px-2 py-3 text-neutral-700">{row.upiId}</td>
                  <td className="px-2 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${payoutStatusClass(row.payoutStatus)}`}
                    >
                      {row.payoutStatus}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-neutral-600">{row.payoutUtr ?? '—'}</td>
                </tr>
              ))}
              {!loading && (data?.withdrawals.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-neutral-500">
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
