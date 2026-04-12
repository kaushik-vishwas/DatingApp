import { Eye } from 'lucide-react';

const cards = [
  { label: 'Pending Reports', value: '8', tone: 'text-amber-600' },
  { label: 'Resolved Today', value: '15', tone: 'text-emerald-600' },
  { label: 'Users Warned', value: '5', tone: 'text-orange-600' },
  { label: 'Users Suspended', value: '2', tone: 'text-red-600' },
];

const rows = [
  {
    id: 'R001',
    reporter: 'Rahul M.',
    reported: 'Anonymous',
    reason: 'Inappropriate behavior',
    preview: 'Offensive language during call...',
    date: 'March 3, 2026 11:30 AM',
    status: 'Pending',
  },
  {
    id: 'R002',
    reporter: 'Priya S.',
    reported: 'Vikram R.',
    reason: 'Harassment',
    preview: 'Repeated unwanted calls...',
    date: 'March 3, 2026 09:25 AM',
    status: 'Pending',
  },
  {
    id: 'R003',
    reporter: 'Anjali G.',
    reported: 'Random User',
    reason: 'Spam',
    preview: 'Promotional content in chat...',
    date: 'March 2, 2026 08:45 PM',
    status: 'Resolved',
  },
];

const reasonClass = (reason: string) => {
  if (reason === 'Spam') return 'bg-red-50 text-red-700';
  if (reason === 'Harassment') return 'bg-orange-50 text-orange-700';
  return 'bg-rose-50 text-rose-700';
};

const statusClass = (status: string) =>
  status === 'Resolved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';

export function ReportsPage() {
  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-neutral-900">Reports &amp; Moderation</h1>
        <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-500">Search...</div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium text-neutral-500">{card.label}</p>
            <p className={`mt-1.5 text-3xl font-bold ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Report ID</th>
                <th className="px-3 py-2">Reporter</th>
                <th className="px-3 py-2">Reported user</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Preview</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-neutral-100">
                  <td className="px-3 py-2.5 font-medium text-neutral-700">{row.id}</td>
                  <td className="px-3 py-2.5 text-neutral-700">{row.reporter}</td>
                  <td className="px-3 py-2.5 text-neutral-700">{row.reported}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${reasonClass(row.reason)}`}>
                      {row.reason}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-neutral-500">{row.preview}</td>
                  <td className="px-3 py-2.5 text-neutral-500">{row.date}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {row.status === 'Pending' ? (
                      <div className="flex items-center gap-1.5">
                        <button className="rounded p-1 text-neutral-500 hover:bg-neutral-100">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button className="rounded bg-orange-50 px-1.5 py-1 text-[10px] font-semibold text-orange-700">
                          Warn
                        </button>
                        <button className="rounded bg-red-50 px-1.5 py-1 text-[10px] font-semibold text-red-700">
                          Suspend
                        </button>
                        <button className="rounded bg-neutral-100 px-1.5 py-1 text-[10px] font-semibold text-neutral-600">
                          Ignore
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-neutral-400">Resolved</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
