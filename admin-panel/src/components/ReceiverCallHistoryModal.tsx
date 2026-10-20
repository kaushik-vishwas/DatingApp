import { useEffect, useState } from 'react';

import { fetchReceiverDayCalls, type ReceiverDayCall, type ReceiverRecord } from '../api/client';

type Props = {
  receiver: ReceiverRecord | null;
  onClose: () => void;
};

function todayIst(): string {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

export function ReceiverCallHistoryModal({ receiver, onClose }: Props) {
  const [date, setDate] = useState(todayIst);
  const [calls, setCalls] = useState<ReceiverDayCall[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (receiver) setDate(todayIst());
  }, [receiver]);

  useEffect(() => {
    if (!receiver || !date) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchReceiverDayCalls(receiver._id, date)
      .then((data) => {
        if (!cancelled) setCalls(data.calls);
      })
      .catch(() => {
        if (!cancelled) {
          setCalls([]);
          setError('Failed to load calls');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [receiver, date]);

  if (!receiver) return null;

  const shown = calls.filter((c) => c.durationSec > 0 || c.status === 'ongoing');
  const talked = shown.filter((c) => c.durationSec > 0);
  const totalSec = talked.reduce((sum, c) => sum + c.durationSec, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">{receiver.name} · Call history</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {talked.length} talked · {formatDuration(totalSec)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              max={todayIst()}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 shadow-sm"
            />
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-sm font-semibold text-neutral-500 hover:bg-neutral-100"
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200">
          {loading ? (
            <p className="p-8 text-center text-sm text-neutral-500">Loading…</p>
          ) : error ? (
            <p className="p-8 text-center text-sm text-red-600">{error}</p>
          ) : shown.length === 0 ? (
            <p className="p-8 text-center text-sm text-neutral-500">No calls on this date.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/80 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Caller</th>
                  <th className="px-4 py-2">Talk time</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.callId} className="border-b border-neutral-100 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-neutral-700">
                      {formatTime(c.talkStartedAt ?? c.startedAt)} – {formatTime(c.endedAt)}
                    </td>
                    <td className="px-4 py-2">
                      <p className="font-medium text-neutral-900">{c.callerName ?? 'Deleted user'}</p>
                      {c.callerPhone ? <p className="text-xs text-neutral-500">{c.callerPhone}</p> : null}
                    </td>
                    <td className="px-4 py-2 text-neutral-700">
                      {c.status === 'ongoing' ? (
                        <span className="font-semibold text-emerald-600">On call</span>
                      ) : (
                        formatDuration(c.durationSec)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
