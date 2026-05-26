import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  fetchAdminSettings,
  updateAdminReceiverWelcome,
  type ReceiverWelcomeSettings,
} from '../api/client';

const DEFAULT_TITLE = 'Welcome to Selecto';

export function ReceiverWelcomePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState<ReceiverWelcomeSettings>({
    enabled: true,
    title: DEFAULT_TITLE,
    body: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminSettings();
      setForm(res.receiverWelcome ?? { enabled: true, title: DEFAULT_TITLE, body: '' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load welcome message');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const res = await updateAdminReceiverWelcome({
        enabled: form.enabled,
        title: form.title.trim() || DEFAULT_TITLE,
        body: form.body.trim(),
      });
      setForm(res.receiverWelcome);
      setOk('Receiver home welcome card updated.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Receiver home welcome</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Shown on the receiver home screen below Earning Levels. Leave body empty to hide the card.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}
      {ok ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{ok}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-neutral-300 text-[#7b2cff] focus:ring-[#7b2cff]"
            />
            <span className="text-sm font-semibold text-neutral-800">Show welcome card on receiver home</span>
          </label>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Card title
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={120}
              placeholder={DEFAULT_TITLE}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-[#7b2cff] focus:outline-none focus:ring-2 focus:ring-[#7b2cff]/20"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Message body
            </label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              maxLength={3000}
              rows={10}
              placeholder="Write tips, announcements, or onboarding notes for receivers…"
              className="w-full resize-y rounded-xl border border-neutral-200 px-3 py-2.5 text-sm leading-relaxed focus:border-[#7b2cff] focus:outline-none focus:ring-2 focus:ring-[#7b2cff]/20"
            />
            <p className="mt-1 text-xs text-neutral-500">{form.body.length} / 3000 characters</p>
          </div>

          {/* <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Preview</p>
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-base font-bold text-neutral-900">{form.title.trim() || DEFAULT_TITLE}</p>
              {form.body.trim() ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{form.body}</p>
              ) : (
                <p className="mt-2 text-sm italic text-neutral-400">Card hidden until you add message text.</p>
              )}
            </div>
          </div> */}

          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="rounded-xl bg-[#7b2cff] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#6a24db] disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save welcome message'}
          </button>
        </div>
      )}
    </div>
  );
}
