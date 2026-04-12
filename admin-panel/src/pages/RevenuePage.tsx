import { Download, Search } from 'lucide-react';

const breakdownRows = [
  { date: 'Mar 3', calls: '124,580', commission: '24,916', payout: '99,664' },
  { date: 'Mar 2', calls: '98,750', commission: '19,750', payout: '79,000' },
  { date: 'Mar 1', calls: '112,340', commission: '22,468', payout: '89,872' },
  { date: 'Feb 28', calls: '95,680', commission: '19,136', payout: '76,544' },
  { date: 'Feb 28', calls: '108,920', commission: '21,784', payout: '87,136' },
];

const topEarners = [
  { name: 'Priya Sharma', calls: 161, earnings: '20,200', payout: '15,600' },
  { name: 'Amit Kumar', calls: 132, earnings: '18,000', payout: '13,200' },
  { name: 'Sneha Verma', calls: 157, earnings: '17,500', payout: '14,000' },
];

const statCards = [
  { label: 'Gross Revenue', value: '₹1246k', note: '+12.8%', tone: 'text-emerald-600' },
  { label: 'Platform Commission', value: '₹249k', note: '20% of gross', tone: 'text-[#7b2cff]' },
  { label: 'Net Payout', value: '₹997k', note: 'To receivers', tone: 'text-sky-600' },
  { label: 'Platform Profit', value: '₹249k', note: 'After expenses', tone: 'text-emerald-600' },
];

export function RevenuePage() {
  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-neutral-900">Revenue Dashboard</h1>
        <div className="flex items-center gap-2">
          <button className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-600">
            Last 7 days
          </button>
          <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-500">
            <Search className="h-3.5 w-3.5" />
            Search...
          </div>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-[#7b2cff] px-3 py-2 text-xs font-semibold text-white">
            <Download className="h-3.5 w-3.5" />
            Export Report
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium text-neutral-500">{card.label}</p>
            <p className="mt-1.5 text-3xl font-bold text-neutral-900">{card.value}</p>
            <p className={`mt-1 text-xs font-medium ${card.tone}`}>{card.note}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-bold text-neutral-800">Daily Revenue Breakdown</h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Calls Revenue</th>
                  <th className="px-3 py-2">Commission</th>
                  <th className="px-3 py-2">Payout</th>
                </tr>
              </thead>
              <tbody>
                {breakdownRows.map((row) => (
                  <tr key={`${row.date}-${row.calls}`} className="border-t border-neutral-100">
                    <td className="px-3 py-2.5 font-medium text-neutral-700">{row.date}</td>
                    <td className="px-3 py-2.5 text-neutral-700">₹{row.calls}</td>
                    <td className="px-3 py-2.5 font-semibold text-[#7b2cff]">₹{row.commission}</td>
                    <td className="px-3 py-2.5 font-semibold text-sky-600">₹{row.payout}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-bold text-neutral-800">Top Earning Receivers</h2>
          <div className="mt-3 space-y-3">
            {topEarners.map((item) => (
              <div key={item.name} className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-neutral-800">{item.name}</p>
                  <p className="text-[11px] text-neutral-500">{item.calls} calls</p>
                </div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  <p>
                    Gross: <span className="font-medium text-neutral-700">₹{item.earnings}</span>
                  </p>
                  <p>
                    Payout: <span className="font-semibold text-emerald-600">₹{item.payout}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
