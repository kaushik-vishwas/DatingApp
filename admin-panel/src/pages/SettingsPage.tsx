export function SettingsPage() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Platform Settings</h1>
        <button className="rounded-lg bg-[#7b2cff] px-4 py-2 text-xs font-semibold text-white">Save Changes</button>
      </div>

      <div className="mt-6 space-y-5">
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-bold text-neutral-800">Commission Settings</h2>
          <div className="mt-3 max-w-xs">
            <label className="text-[11px] font-medium text-neutral-500">Platform Commission (%)</label>
            <input
              defaultValue="20"
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 outline-none ring-[#7b2cff]/30 focus:border-[#7b2cff] focus:ring-2"
            />
            <p className="mt-1 text-[11px] text-neutral-400">Current: 20% | Receivers keep 80%</p>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-bold text-neutral-800">Notification Control</h2>
          <div className="mt-3 space-y-2 text-sm text-neutral-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="accent-[#7b2cff]" />
              Send email notifications for new KYC submissions
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="accent-[#7b2cff]" />
              Send email notifications for pending withdrawals
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="accent-[#7b2cff]" />
              Send daily revenue summary emails
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-bold text-neutral-800">Admin Role Management</h2>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-neutral-800">Super Admin</p>
                <p className="text-[11px] text-neutral-500">Full access to all features</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Active</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-neutral-800">Support Admin</p>
                <p className="text-[11px] text-neutral-500">Can view and manage user reports</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Active</span>
            </div>
          </div>
          <button className="mt-3 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700">
            + Add New Admin Role
          </button>
        </section>
      </div>
    </div>
  );
}
