import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';
import {
  fetchAdminSettings,
  updateAdminRole,
  updateAdminReceiverEarningModel,
  updateAdminSettingsNotifications,
  type AdminRole,
  type AdminSettingsResponse,
  type FixedPerMinuteWindow,
  type ReceiverEarningModel,
} from '../api/client';

const DEFAULT_WINDOWS: FixedPerMinuteWindow[] = [
  { id: 'day', label: '6 AM – 9 PM', from: '06:00', to: '21:00', ratePerMinute: 2 },
  { id: 'evening', label: '9 PM – 11 PM', from: '21:00', to: '23:00', ratePerMinute: 2.2 },
  { id: 'night', label: '11 PM – 6 AM', from: '23:00', to: '06:00', ratePerMinute: 2.5 },
];

export function SettingsPage() {
  const { admin } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingEarning, setSavingEarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [data, setData] = useState<AdminSettingsResponse | null>(null);
  const [notifications, setNotifications] = useState<AdminSettingsResponse['notificationControls'] | null>(null);
  const [earningModel, setEarningModel] = useState<ReceiverEarningModel>('score_based');
  const [fixedWindows, setFixedWindows] = useState<FixedPerMinuteWindow[]>(DEFAULT_WINDOWS);
  const canManageRoles = admin?.role === 'super_admin';

  const roleLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const role of data?.rolesCatalog ?? []) map.set(role.id, role.label);
    return map;
  }, [data?.rolesCatalog]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminSettings();
      setData(res);
      setNotifications(res.notificationControls);
      setEarningModel(res.receiverEarningModel ?? 'score_based');
      setFixedWindows(
        res.fixedPerMinuteWindows?.length ? res.fixedPerMinuteWindows : DEFAULT_WINDOWS
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSaveNotifications = async () => {
    if (!notifications) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const res = await updateAdminSettingsNotifications(notifications);
      setNotifications(res.notificationControls);
      setOk('Notification controls updated.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const onSaveEarningModel = async () => {
    setSavingEarning(true);
    setError(null);
    setOk(null);
    try {
      const res = await updateAdminReceiverEarningModel({
        receiverEarningModel: earningModel,
        fixedPerMinuteWindows: fixedWindows.map((w) => ({
          ...w,
          ratePerMinute: Number(w.ratePerMinute) || 0,
        })),
      });
      setEarningModel(res.receiverEarningModel);
      setFixedWindows(res.fixedPerMinuteWindows);
      setOk('Receiver earning model updated. Active receivers will use the new rates on the next call sync.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save earning model');
    } finally {
      setSavingEarning(false);
    }
  };

  const onChangeRole = async (adminId: string, role: AdminRole) => {
    if (!canManageRoles) return;
    setError(null);
    setOk(null);
    try {
      await updateAdminRole(adminId, role);
      setData((prev) =>
        prev
          ? {
              ...prev,
              admins: prev.admins.map((a) => (a._id === adminId ? { ...a, role } : a)),
            }
          : prev
      );
      setOk('Admin role updated.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update role');
    }
  };

  const updateWindowRate = (id: string, ratePerMinute: number) => {
    setFixedWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ratePerMinute: Math.max(0, ratePerMinute) } : w))
    );
  };

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-neutral-900">Platform Settings</h1>
        <button
          onClick={() => void onSaveNotifications()}
          disabled={saving || loading || !notifications}
          className="rounded-lg bg-[#7b2cff] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save notifications'}
        </button>
      </div>
      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {ok ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p>
      ) : null}

      <div className="mt-6 space-y-5">
        {/* <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-neutral-800">Receiver earning model</h2>
              <p className="mt-1 text-[11px] text-neutral-500">
                Score based keeps the existing badge/score system. Fixed per minute uses IST time windows below.
              </p>
            </div>
            <button
              onClick={() => void onSaveEarningModel()}
              disabled={savingEarning || loading}
              className="rounded-lg border border-[#7b2cff] bg-white px-4 py-2 text-xs font-semibold text-[#7b2cff] disabled:opacity-60"
            >
              {savingEarning ? 'Saving...' : 'Save earning model'}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm">
              <input
                type="radio"
                name="earningModel"
                checked={earningModel === 'score_based'}
                onChange={() => setEarningModel('score_based')}
                className="accent-[#7b2cff]"
              />
              Score based
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm">
              <input
                type="radio"
                name="earningModel"
                checked={earningModel === 'fixed_per_minute'}
                onChange={() => setEarningModel('fixed_per_minute')}
                className="accent-[#7b2cff]"
              />
              Fixed per minute
            </label>
          </div>

          {earningModel === 'fixed_per_minute' ? (
            <div className="mt-4 overflow-hidden rounded-lg border border-neutral-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-3 py-2">Window (IST)</th>
                    <th className="px-3 py-2">Rate (₹/min)</th>
                  </tr>
                </thead>
                <tbody>
                  {fixedWindows.map((w) => (
                    <tr key={w.id} className="border-t border-neutral-100">
                      <td className="px-3 py-2.5 font-medium text-neutral-800">{w.label}</td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={w.ratePerMinute}
                          onChange={(e) => updateWindowRate(w.id, Number(e.target.value))}
                          className="w-28 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm font-medium text-neutral-800"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-neutral-100 bg-neutral-50 px-3 py-2 text-[11px] text-neutral-500">
                Times are Asia/Kolkata. Calls crossing a window are settled using each minute&apos;s rate.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-neutral-500">
              Platinum / Diamond / Supreme badges and score multipliers remain unchanged.
            </p>
          )}
        </section> */}

        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-bold text-neutral-800">Notification Control</h2>
          <div className="mt-3 space-y-2 text-sm text-neutral-700">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(notifications?.kycSubmissionsEmail)}
                onChange={(e) =>
                  setNotifications((prev) =>
                    prev ? { ...prev, kycSubmissionsEmail: e.target.checked } : prev
                  )
                }
                className="accent-[#7b2cff]"
              />
              Send email notifications for new KYC submissions
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(notifications?.pendingWithdrawalsEmail)}
                onChange={(e) =>
                  setNotifications((prev) =>
                    prev ? { ...prev, pendingWithdrawalsEmail: e.target.checked } : prev
                  )
                }
                className="accent-[#7b2cff]"
              />
              Send email notifications for pending withdrawals
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(notifications?.dailyRevenueSummaryEmail)}
                onChange={(e) =>
                  setNotifications((prev) =>
                    prev ? { ...prev, dailyRevenueSummaryEmail: e.target.checked } : prev
                  )
                }
                className="accent-[#7b2cff]"
              />
              Send daily revenue summary emails
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-bold text-neutral-800">Admin Role Management</h2>
          <div className="mt-3 space-y-3">
            {(data?.admins ?? []).map((a) => (
              <div key={a._id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-neutral-800">{a.name}</p>
                  <p className="text-[11px] text-neutral-500">{a.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={a.role}
                    disabled={!canManageRoles}
                    onChange={(e) => void onChangeRole(a._id, e.target.value as AdminRole)}
                    className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-700 disabled:opacity-60"
                  >
                    {(data?.rolesCatalog ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                    {a.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-neutral-500">
            {canManageRoles
              ? 'Role updates apply immediately.'
              : `Only super admin can manage roles. Your role: ${roleLabelById.get(admin?.role ?? '') ?? admin?.role ?? 'admin'}`}
          </p>
        </section>
      </div>
    </div>
  );
}
