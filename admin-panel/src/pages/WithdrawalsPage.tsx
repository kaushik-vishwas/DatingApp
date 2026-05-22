import { Check, Eye, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchWithdrawals,
  resolveWithdrawal,
  type AdminWithdrawalRow,
  type AdminWithdrawalStats,
} from '../api/client';

const emptyStats: AdminWithdrawalStats = {
  pendingCount: 0,
  pendingAmount: 0,
  approvedTodayCount: 0,
  approvedTodayAmount: 0,
  rejectedTodayCount: 0,
  rejectedTodayAmount: 0,
  processedCount: 0,
  processedTodayAmount: 0,
};

const statusClass = (status: string) => {
  if (status === 'success' || status === 'approved') return 'bg-emerald-50 text-emerald-700';
  if (status === 'failed' || status === 'rejected') return 'bg-red-50 text-red-700';
  return 'bg-amber-50 text-amber-700';
};

const prettyStatus = (row: AdminWithdrawalRow) => {
  if (row.payoutStatus) return row.payoutStatus[0].toUpperCase() + row.payoutStatus.slice(1);
  return row.status[0].toUpperCase() + row.status.slice(1);
};

const resolvePayoutMethod = (row: AdminWithdrawalRow): 'upi' | 'bank' =>
  row.payoutMethod ?? (row.bankName?.trim().toUpperCase() === 'UPI' ? 'upi' : 'bank');

const payoutMethodLabel = (row: AdminWithdrawalRow) =>
  resolvePayoutMethod(row) === 'upi' ? 'UPI (RazorpayX)' : 'Bank (RazorpayX)';

export function WithdrawalsPage() {
  const [stats, setStats] = useState<AdminWithdrawalStats>(emptyStats);
  const [rows, setRows] = useState<AdminWithdrawalRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWithdrawals({ range, status: 'all', page: 1 });
      setStats(data.stats);
      setRows(data.rows);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load withdrawals';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const onAction = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id);
    setError(null);
    try {
      await resolveWithdrawal(id, action);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Action failed';
      setError(msg);
    } finally {
      setBusyId(null);
    }
  };

  const cards = [
    {
      label: 'Pending Withdrawals',
      value: String(stats.pendingCount),
      note: `₹${stats.pendingAmount.toLocaleString('en-IN')} total`,
      tone: 'text-amber-600',
    },
    {
      label: 'Approved Today',
      value: String(stats.approvedTodayCount),
      note: `₹${stats.approvedTodayAmount.toLocaleString('en-IN')} total`,
      tone: 'text-emerald-600',
    },
    {
      label: 'Rejected Today',
      value: String(stats.rejectedTodayCount),
      note: `₹${stats.rejectedTodayAmount.toLocaleString('en-IN')} total`,
      tone: 'text-red-600',
    },
    {
      label: 'Processed',
      value: String(stats.processedCount),
      note: `₹${stats.processedTodayAmount.toLocaleString('en-IN')} today`,
      tone: 'text-[#7b2cff]',
    },
  ];

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-neutral-900">Withdrawal Management</h1>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as '7d' | '30d' | 'all')}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-600"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium text-neutral-500">{card.label}</p>
            <p className="mt-1.5 text-3xl font-bold text-neutral-900">{loading ? '…' : card.value}</p>
            <p className={`mt-1 text-xs font-medium ${card.tone}`}>{card.note}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Receiver</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Payout destination</th>
                <th className="px-3 py-2">Request date</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="border-t border-neutral-100">
                  <td className="px-3 py-2.5 font-medium text-neutral-700">{row.withdrawalId}</td>
                  <td className="px-3 py-2.5 font-medium text-neutral-800">{row.receiverName}</td>
                  <td className="px-3 py-2.5 font-semibold text-neutral-800">₹{row.amount.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2.5 text-neutral-600">
                    <p className="font-semibold text-neutral-800">{payoutMethodLabel(row)}</p>
                    {row.accountHolderName ? (
                      <p className="text-[11px]">{row.accountHolderName}</p>
                    ) : null}
                    <p className="text-[11px]">
                      {resolvePayoutMethod(row) === 'upi'
                        ? row.accountMasked
                        : `${row.bankName} · ${row.accountMasked}`}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-neutral-600">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(row.payoutStatus ?? row.status)}`}>
                      {prettyStatus(row)}
                    </span>
                    {row.payoutUtr ? <p className="mt-1 text-[11px] text-neutral-500">UTR: {row.payoutUtr}</p> : null}
                    {row.payoutError ? (
                      <p className="mt-1 text-[11px] text-red-600" title={row.payoutError}>
                        {row.payoutError.length > 80 ? `${row.payoutError.slice(0, 80)}…` : row.payoutError}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    {row.status === 'pending' ? (
                      <div className="flex items-center gap-1.5 text-neutral-500">
                        <button className="rounded p-1 hover:bg-neutral-100" title="View">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                          disabled={busyId === row._id}
                          onClick={() => void onAction(row._id, 'approve')}
                          title="Approve"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
                          disabled={busyId === row._id}
                          onClick={() => void onAction(row._id, 'reject')}
                          title="Reject"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-neutral-400">No actions</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-neutral-500">No withdrawals found.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
