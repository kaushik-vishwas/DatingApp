import { IndianRupee, Phone, UserCheck, Users } from 'lucide-react';

const cards = [
  { label: 'Total Revenue', value: '₹1,24,580', icon: IndianRupee, tone: 'text-violet-600' },
  { label: 'Total Calls', value: '1,847', icon: Phone, tone: 'text-sky-600' },
  { label: 'Active Receivers', value: '342', sub: '+5.1%', icon: UserCheck, tone: 'text-emerald-600' },
  { label: 'Active Users', value: '5,628', sub: '-2.3%', icon: Users, tone: 'text-amber-600' },
];

export function OverviewPage() {
  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Overview</h1>
          <p className="mt-1 text-sm text-neutral-500">Nesthama — high-level snapshot (static demo data)</p>
        </div>
        <div className="flex gap-2">
          <select className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm">
            <option>Last 7 days</option>
          </select>
          <input
            type="search"
            placeholder="Search…"
            className="w-48 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, sub, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
                <p className="mt-2 text-2xl font-bold text-neutral-900">{value}</p>
                {sub ? <p className="mt-1 text-xs font-medium text-neutral-500">{sub}</p> : null}
              </div>
              <div className={`rounded-xl bg-neutral-100 p-2 ${tone}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-neutral-900">Revenue Trend (Last 7 Days)</h2>
          <div className="mt-6 flex h-40 items-end justify-between gap-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
              <div key={d} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full max-w-[32px] rounded-t bg-[#ff72d2]/90"
                  style={{ height: `${40 + (i * 7) % 100}px` }}
                />
                <span className="text-[10px] font-medium text-neutral-400">{d}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-neutral-900">Action required</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex justify-between rounded-xl bg-amber-50 px-3 py-2">
              <span className="text-neutral-700">Pending KYC Approvals</span>
              <span className="font-bold text-amber-700">23</span>
            </li>
            <li className="flex justify-between rounded-xl bg-sky-50 px-3 py-2">
              <span className="text-neutral-700">Pending Withdrawals</span>
              <span className="font-bold text-sky-700">15</span>
            </li>
            <li className="flex justify-between rounded-xl bg-red-50 px-3 py-2">
              <span className="text-neutral-700">Flagged Reports</span>
              <span className="font-bold text-red-700">8</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
