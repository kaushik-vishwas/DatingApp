import { Check, Eye, X } from 'lucide-react';

const cards = [
  { label: 'Pending Withdrawals', value: '15', note: '₹2,45,000 total', tone: 'text-amber-600' },
  { label: 'Approved Today', value: '28', note: '₹4,82,000 total', tone: 'text-emerald-600' },
  { label: 'Rejected Today', value: '2', note: '₹12,000 total', tone: 'text-red-600' },
  { label: 'Processed', value: '12', note: '₹1,10,000 today', tone: 'text-[#7b2cff]' },
];

const rows = [
  {
    id: 'W001',
    receiver: 'Priya Sharma',
    amount: '15,000',
    bank: 'HDFC Bank',
    account: '****1234',
    date: 'March 3, 2026 10:30 AM',
    status: 'Pending',
  },
  {
    id: 'W002',
    receiver: 'Amit Kumar',
    amount: '8,500',
    bank: 'ICICI Bank',
    account: '****7557',
    date: 'March 3, 2026 09:15 AM',
    status: 'Pending',
  },
  {
    id: 'W003',
    receiver: 'Sneha Verma',
    amount: '12,000',
    bank: 'SBI',
    account: '****2316',
    date: 'March 2, 2026 05:45 PM',
    status: 'Approved',
  },
  {
    id: 'W004',
    receiver: 'Rohit Patel',
    amount: '5,000',
    bank: 'Axis Bank',
    account: '****3416',
    date: 'March 2, 2026 05:10 PM',
    status: 'Rejected',
  },
];

const statusClass = (status: string) => {
  if (status === 'Approved') return 'bg-emerald-50 text-emerald-700';
  if (status === 'Rejected') return 'bg-red-50 text-red-700';
  return 'bg-amber-50 text-amber-700';
};

export function WithdrawalsPage() {
  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-neutral-900">Withdrawal Management</h1>
        <button className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-600">
          Last 7 days
        </button>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium text-neutral-500">{card.label}</p>
            <p className="mt-1.5 text-3xl font-bold text-neutral-900">{card.value}</p>
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
                <th className="px-3 py-2">Receiver</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Bank details</th>
                <th className="px-3 py-2">Request date</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-neutral-100">
                  <td className="px-3 py-2.5 font-medium text-neutral-700">{row.id}</td>
                  <td className="px-3 py-2.5 font-medium text-neutral-800">{row.receiver}</td>
                  <td className="px-3 py-2.5 font-semibold text-neutral-800">₹{row.amount}</td>
                  <td className="px-3 py-2.5 text-neutral-600">
                    <p>{row.bank}</p>
                    <p className="text-[11px]">{row.account}</p>
                  </td>
                  <td className="px-3 py-2.5 text-neutral-600">{row.date}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {row.status === 'Pending' ? (
                      <div className="flex items-center gap-1.5 text-neutral-500">
                        <button className="rounded p-1 hover:bg-neutral-100">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button className="rounded p-1 text-emerald-600 hover:bg-emerald-50">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button className="rounded p-1 text-red-600 hover:bg-red-50">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-neutral-400">No actions</span>
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
