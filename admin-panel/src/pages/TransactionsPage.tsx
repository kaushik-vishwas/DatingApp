import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchTransactions,
  getApiErrorMessage,
  type AdminTransactionRow,
  type AdminTransactionStats,
} from '../api/client';

const emptyStats: AdminTransactionStats = {
  totalCount: 0,
  totalPaid: 0,
  totalCredit: 0,
  todayCount: 0,
  todayPaid: 0,
};

const formatInr = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function TransactionsPage() {
  const [stats, setStats] = useState<AdminTransactionStats>(emptyStats);
  const [rows, setRows] = useState<AdminTransactionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTransactions({ range, q: debouncedSearch || undefined, page });
      setStats(data.stats);
      setRows(data.rows);
      setTotal(data.total);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to load transactions'));
    } finally {
      setLoading(false);
    }
  }, [range, debouncedSearch, page]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [range, debouncedSearch]);

  const cards = useMemo(
    () => [
      {
        label: 'Total Transactions',
        value: String(stats.totalCount),
        note: `${formatInr(stats.totalPaid)} collected`,
        tone: 'text-[#7b2cff]',
      },
      {
        label: 'Wallet Credit Added',
        value: formatInr(stats.totalCredit),
        note: 'Credited to caller wallets',
        tone: 'text-emerald-600',
      },
      {
        label: 'Today',
        value: String(stats.todayCount),
        note: `${formatInr(stats.todayPaid)} collected`,
        tone: 'text-sky-600',
      },
      {
        label: 'Avg. Top-up',
        value:
          stats.totalCount > 0 ? formatInr(stats.totalPaid / stats.totalCount) : '₹0',
        note: 'Per transaction in range',
        tone: 'text-neutral-600',
      },
    ],
    [stats]
  );

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-neutral-900">Transactions</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search caller, phone, payment ID…"
              className="w-56 rounded-xl border border-neutral-200 bg-white py-2 pl-8 pr-3 text-xs text-neutral-700 outline-none ring-[#7b2cff]/20 focus:ring-2 md:w-64"
            />
          </div>
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
                <th className="px-3 py-2">Caller</th>
                <th className="px-3 py-2">Paid</th>
                <th className="px-3 py-2">Credit</th>
                <th className="px-3 py-2">Platform fee</th>
                <th className="px-3 py-2">Razorpay</th>
                <th className="px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-neutral-500">
                    No wallet transactions found.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row._id} className="border-t border-neutral-100">
                  <td className="px-3 py-2.5 font-medium text-neutral-700">{row.transactionId}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-neutral-800">{row.userName}</p>
                    <p className="text-[11px] text-neutral-500">{row.userPhone || row.userEmail || '—'}</p>
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-neutral-800">{formatInr(row.payAmount)}</td>
                  <td className="px-3 py-2.5 text-emerald-700">
                    +{formatInr(row.creditAdded)}
                    {row.bonusPercent > 0 ? (
                      <p className="text-[10px] font-medium text-neutral-500">Bonus {row.bonusPercent}%</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-neutral-600">
                    {row.platformFee > 0 ? formatInr(row.platformFee) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-neutral-600">
                    <p className="break-all font-mono text-[10px]">{row.razorpayPaymentId}</p>
                    <p className="break-all font-mono text-[10px] text-neutral-400">{row.razorpayOrderId}</p>
                  </td>
                  <td className="px-3 py-2.5 text-neutral-600">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-xs text-neutral-600">
            <p>
              Page {page} of {totalPages} · {total} total
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 font-semibold disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 font-semibold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
