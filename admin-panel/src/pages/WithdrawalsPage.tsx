import { Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchWithdrawals,
  getApiErrorMessage,
  resolveWithdrawal,
  type AdminWithdrawalRow,
  type AdminWithdrawalStats,
} from '../api/client';

type ActionStatus = 'pending' | 'paid' | 'rejected';

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
  if (status === 'success' || status === 'approved' || status === 'paid') return 'bg-emerald-50 text-emerald-700';
  if (status === 'failed' || status === 'rejected') return 'bg-red-50 text-red-700';
  return 'bg-amber-50 text-amber-700';
};

const prettyStatus = (row: AdminWithdrawalRow) => {
  if (row.status === 'pending') return 'Pending';
  if (row.status === 'approved') return row.payoutStatus === 'success' ? 'Paid' : 'Approved';
  if (row.status === 'rejected') return 'Rejected';
  return String(row.status);
};

const resolvePayoutMethod = (row: AdminWithdrawalRow): 'upi' | 'bank' => {
  if (row.payoutMethod === 'upi' || row.payoutMethod === 'bank') return row.payoutMethod;
  if (row.upiId?.trim()) return 'upi';
  if (row.bankAccountNumber?.trim()) return 'bank';
  return row.bankName?.trim().toUpperCase() === 'UPI' ? 'upi' : 'bank';
};

const payoutMethodLabel = (row: AdminWithdrawalRow) =>
  resolvePayoutMethod(row) === 'upi' ? 'UPI' : 'Bank transfer';

/** Full destination text for table — never show masked **** values. */
const destinationSummary = (row: AdminWithdrawalRow): string => {
  const method = resolvePayoutMethod(row);
  if (method === 'upi') {
    return row.upiId?.trim() || 'UPI details unavailable';
  }
  const parts = [
    row.bankAccountNumber?.trim(),
    row.bankIfsc?.trim(),
    row.bankName?.trim() && row.bankName.trim().toUpperCase() !== 'BANK' ? row.bankName.trim() : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Bank details unavailable';
};

const rowActionStatus = (row: AdminWithdrawalRow): ActionStatus => {
  if (row.status === 'rejected') return 'rejected';
  if (row.status === 'approved' && row.payoutStatus === 'success') return 'paid';
  return 'pending';
};

const formatInr = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const payoutNet = (row: AdminWithdrawalRow) =>
  typeof row.payoutAmount === 'number' && Number.isFinite(row.payoutAmount) && row.payoutAmount > 0
    ? row.payoutAmount
    : Math.max(0, Number(row.amount || 0) - Number(row.platformFee || 0));

type ConfirmState = {
  row: AdminWithdrawalRow;
  next: Exclude<ActionStatus, 'pending'>;
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value.trim()) return null;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/70">{label}</p>
        <p className="mt-0.5 break-all font-mono text-base font-bold tracking-wide text-neutral-950">{value}</p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-emerald-700 hover:bg-emerald-50"
        title={`Copy ${label}`}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function PayoutDestinationCard({ row }: { row: AdminWithdrawalRow }) {
  const method = resolvePayoutMethod(row);
  return (
    <div className="rounded-2xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-4 py-3.5 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">
          Pay to this account
        </p>
        <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          {method === 'upi' ? 'UPI' : 'Bank'}
        </span>
      </div>
      <div className="space-y-3">
        {row.accountHolderName?.trim() ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/70">
              Account holder
            </p>
            <p className="mt-0.5 text-sm font-semibold text-neutral-900">{row.accountHolderName}</p>
          </div>
        ) : null}
        {method === 'upi' ? (
          <CopyField label="UPI ID" value={row.upiId?.trim() || ''} />
        ) : (
          <>
            <CopyField label="Account number" value={row.bankAccountNumber?.trim() || ''} />
            <CopyField label="IFSC" value={row.bankIfsc?.trim() || ''} />
            {row.bankName?.trim() ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/70">Bank</p>
                <p className="mt-0.5 text-sm font-semibold text-neutral-900">
                  {row.bankName}
                  {row.bankAccountType ? ` · ${row.bankAccountType}` : ''}
                </p>
              </div>
            ) : null}
          </>
        )}
        {method === 'upi' && row.bankAccountNumber?.trim() ? (
          <div className="space-y-3 border-t border-emerald-200/80 pt-3">
            <CopyField label="Bank account (backup)" value={row.bankAccountNumber} />
            <CopyField label="IFSC" value={row.bankIfsc?.trim() || ''} />
          </div>
        ) : null}
        {method === 'bank' && row.upiId?.trim() ? (
          <div className="border-t border-emerald-200/80 pt-3">
            <CopyField label="UPI ID (backup)" value={row.upiId} />
          </div>
        ) : null}
        {!row.upiId?.trim() && !row.bankAccountNumber?.trim() ? (
          <p className="text-sm font-medium text-red-700">
            Full account details are not available on this receiver profile.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function WithdrawalsPage() {
  const [stats, setStats] = useState<AdminWithdrawalStats>(emptyStats);
  const [rows, setRows] = useState<AdminWithdrawalRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWithdrawals({ range, status: 'all', page: 1 });
      setStats(data.stats);
      setRows(data.rows);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to load withdrawals'));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const onConfirmAction = async () => {
    if (!confirm) return;
    const { row, next } = confirm;
    setBusyId(row._id);
    setError(null);
    try {
      await resolveWithdrawal(row._id, next === 'paid' ? 'approve' : 'reject');
      setConfirm(null);
      await load();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Action failed'));
    } finally {
      setBusyId(null);
    }
  };

  const cards = [
    {
      label: 'Pending Withdrawals',
      value: String(stats.pendingCount),
      note: `${formatInr(stats.pendingAmount)} total`,
      tone: 'text-amber-600',
    },
    {
      label: 'Approved Today',
      value: String(stats.approvedTodayCount),
      note: `${formatInr(stats.approvedTodayAmount)} total`,
      tone: 'text-emerald-600',
    },
    {
      label: 'Rejected Today',
      value: String(stats.rejectedTodayCount),
      note: `${formatInr(stats.rejectedTodayAmount)} total`,
      tone: 'text-red-600',
    },
    {
      label: 'Processed',
      value: String(stats.processedCount),
      note: `${formatInr(stats.processedTodayAmount)} today`,
      tone: 'text-[#7b2cff]',
    },
  ];

  const confirmCopy = useMemo(() => {
    if (!confirm) return null;
    const { row, next } = confirm;
    const method = resolvePayoutMethod(row);
    const net = payoutNet(row);
    if (next === 'paid') {
      return {
        title: 'Confirm payout',
        lead:
          method === 'upi'
            ? 'Transfer the net amount to this UPI ID from your business account, then mark the request as Paid.'
            : 'Transfer the net amount to this bank account from your business account, then mark the request as Paid.',
        confirmLabel: 'Mark as Paid',
        confirmClass: 'bg-emerald-600 hover:bg-emerald-700',
        amountLabel: 'Amount to pay',
        amount: net,
      };
    }
    return {
      title: 'Reject withdrawal',
      lead: 'This request will be closed without payment. The receiver wallet will not be debited.',
      confirmLabel: 'Mark as Rejected',
      confirmClass: 'bg-red-600 hover:bg-red-700',
      amountLabel: 'Requested amount',
      amount: row.amount,
    };
  }, [confirm]);

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
              {rows.map((row) => {
                const current = rowActionStatus(row);
                const locked = current === 'paid';
                return (
                  <tr key={row._id} className="border-t border-neutral-100">
                    <td className="px-3 py-2.5 font-medium text-neutral-700">{row.withdrawalId}</td>
                    <td className="px-3 py-2.5 font-medium text-neutral-800">{row.receiverName}</td>
                    <td className="px-3 py-2.5 font-semibold text-neutral-800">
                      {formatInr(row.amount)}
                      {typeof row.payoutAmount === 'number' && row.payoutAmount !== row.amount ? (
                        <p className="mt-0.5 text-[10px] font-medium text-neutral-500">
                          Pay {formatInr(payoutNet(row))}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-600">
                      <p className="font-semibold text-neutral-800">{payoutMethodLabel(row)}</p>
                      {row.accountHolderName ? (
                        <p className="text-[11px]">{row.accountHolderName}</p>
                      ) : null}
                      <p className="break-all text-[11px] font-medium text-neutral-800">
                        {destinationSummary(row)}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-neutral-600">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(
                          current === 'paid' ? 'paid' : row.status
                        )}`}
                      >
                        {prettyStatus(row)}
                      </span>
                      {row.payoutUtr ? (
                        <p className="mt-1 text-[11px] text-neutral-500">UTR: {row.payoutUtr}</p>
                      ) : null}
                      {row.payoutError ? (
                        <p className="mt-1 text-[11px] text-red-600" title={row.payoutError}>
                          {row.payoutError.length > 80 ? `${row.payoutError.slice(0, 80)}…` : row.payoutError}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        className="min-w-[120px] rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400"
                        value={current}
                        disabled={locked || busyId === row._id}
                        onChange={(e) => {
                          const next = e.target.value as ActionStatus;
                          if (next === current) return;
                          if (next === 'pending') return;
                          setConfirm({ row, next });
                        }}
                      >
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-neutral-500">No withdrawals found.</p>
          ) : null}
        </div>
      </div>

      {confirm && confirmCopy ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => (busyId ? null : setConfirm(null))}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-neutral-100 px-5 py-4">
              <h2 className="text-base font-bold text-neutral-900">{confirmCopy.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600">{confirmCopy.lead}</p>
            </div>

            <div className="space-y-3 px-5 py-4">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  {confirmCopy.amountLabel}
                </p>
                <p className="mt-1 text-2xl font-bold text-neutral-900">{formatInr(confirmCopy.amount)}</p>
                {confirm.next === 'paid' && Number(confirm.row.platformFee || 0) > 0 ? (
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Requested {formatInr(confirm.row.amount)} · Platform fee{' '}
                    {formatInr(confirm.row.platformFee || 0)}
                  </p>
                ) : null}
              </div>

              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-neutral-500">Request ID</dt>
                  <dd className="font-medium text-neutral-900">{confirm.row.withdrawalId}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-neutral-500">Receiver</dt>
                  <dd className="font-medium text-neutral-900">{confirm.row.receiverName}</dd>
                </div>
              </dl>

              <PayoutDestinationCard row={confirm.row} />

              {confirm.next === 'paid' ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
                  Complete the transfer to the account above, then mark as Paid. This will debit the
                  receiver wallet and close the request.
                </p>
              ) : null}

              {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] leading-relaxed text-red-800">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-neutral-100 px-5 py-3">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
                disabled={busyId === confirm.row._id}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`rounded-lg px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50 ${confirmCopy.confirmClass}`}
                disabled={busyId === confirm.row._id}
                onClick={() => void onConfirmAction()}
              >
                {busyId === confirm.row._id ? 'Saving…' : confirmCopy.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
