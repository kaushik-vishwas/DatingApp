import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';
import {
  fetchAdminSettings,
  updateAdminRole,
  updateAdminSettingsNotifications,
  type AdminRole,
  type AdminSettingsResponse,
} from '../api/client';

export function SettingsPage() {
  const { admin } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [data, setData] = useState<AdminSettingsResponse | null>(null);
  const [notifications, setNotifications] = useState<AdminSettingsResponse['notificationControls'] | null>(null);
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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Platform Settings</h1>
        <button
          onClick={() => void onSaveNotifications()}
          disabled={saving || loading || !notifications}
          className="rounded-lg bg-[#7b2cff] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Changes'}
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
          <h2 className="text-sm font-bold text-neutral-800">Commission Settings</h2>
          <div className="mt-3 max-w-xs">
            <label className="text-[11px] font-medium text-neutral-500">Platform Commission (%)</label>
            <input
              defaultValue="20"
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 outline-none ring-[#7b2cff]/30 focus:border-[#7b2cff] focus:ring-2"
            />
            <p className="mt-1 text-[11px] text-neutral-400">Current: 20% | Receivers keep 80%</p>
          </div>
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
