import { Star } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { fetchCallerAppReviews, type CallerAppReviewAdminRow } from '../api/client';

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

function StarsCell({ n }: { n: number }) {
  if (!Number.isFinite(n) || n < 1) return <span className="text-neutral-400">—</span>;
  const safe = Math.min(5, Math.max(1, Math.round(n)));
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500" title={`${safe} / 5`}>
      {Array.from({ length: safe }, (_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
      ))}
    </span>
  );
}

export function RatingsPage() {
  const [rows, setRows] = useState<CallerAppReviewAdminRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qInput, setQInput] = useState('');
  const [appliedQ, setAppliedQ] = useState('');

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCallerAppReviews({ q: appliedQ, page, limit: 50 });
      setRows(data.reviews);
      setTotal(data.total);
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : 'Failed to load';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [appliedQ, page]);

  useEffect(() => {
    void run();
  }, [run]);

  const applySearch = () => {
    setAppliedQ(qInput.trim());
    setPage(1);
  };

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Ratings</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Caller “Rate Us” feedback — one review per user.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            placeholder="Search name, email, phone, review…"
            className="w-64 max-w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-violet-400"
          />
          <button
            type="button"
            onClick={() => applySearch()}
            className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Search
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
        <p className="mb-3 text-sm text-neutral-600">
          {loading ? '…' : `${total} rating${total === 1 ? '' : 's'} total`}
        </p>
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">User</th>
                {/* <th className="px-3 py-2">Email</th> */}
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Stars</th>
                <th className="px-3 py-2">Review</th>
                <th className="px-3 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="border-t border-neutral-100">
                  <td className="px-3 py-2.5 font-medium text-neutral-800">{row.userName}</td>
                  {/* <td className="px-3 py-2.5 text-neutral-600">{row.email || '—'}</td> */}
                  <td className="px-3 py-2.5 text-neutral-600">{row.phone || '—'}</td>
                  <td className="px-3 py-2.5">
                    <StarsCell n={row.stars} />
                  </td>
                  <td className="max-w-[280px] px-3 py-2.5 text-neutral-700">
                    <span className="line-clamp-3 whitespace-pre-wrap">{row.review}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-neutral-500">{formatDate(row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-neutral-500">No ratings yet.</p>
          ) : null}
        </div>

        {total > 50 ? (
          <div className="mt-3 flex items-center justify-end gap-2 text-sm text-neutral-600">
            <button
              type="button"
              disabled={page <= 1 || loading}
              className="rounded border border-neutral-200 px-2 py-1 disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.max(1, Math.ceil(total / 50))}
            </span>
            <button
              type="button"
              disabled={page >= Math.ceil(total / 50) || loading}
              className="rounded border border-neutral-200 px-2 py-1 disabled:opacity-40"
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
