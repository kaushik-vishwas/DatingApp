import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminNotifications } from '../context/AdminNotificationsContext';

const formatInr = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function AdminNotificationBell() {
  const { items, unreadCount, markAllSeen, markSeen } = useAdminNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) markAllSeen();
        }}
        className="relative rounded-xl border border-neutral-200 bg-white p-2.5 text-neutral-600 shadow-sm hover:bg-neutral-50 hover:text-neutral-900"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" strokeWidth={2.25} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2.5">
            <p className="text-sm font-bold text-neutral-900">Notifications</p>
            <button
              type="button"
              className="text-[11px] font-semibold text-[#7b2cff] hover:underline"
              onClick={() => {
                setOpen(false);
                navigate('/withdrawals');
              }}
            >
              Open withdrawals
            </button>
          </div>
          <div className="max-h-80 overflow-auto">
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-neutral-500">No pending withdrawal requests</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="block w-full border-b border-neutral-50 px-3 py-3 text-left hover:bg-neutral-50"
                  onClick={() => {
                    markSeen(item.id);
                    setOpen(false);
                    navigate('/withdrawals');
                  }}
                >
                  <p className="text-sm font-semibold text-neutral-900">
                    {item.receiverName} requested a withdrawal
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-600">
                    {formatInr(item.payoutAmount || item.amount)}
                    {item.payoutMethod ? ` · ${item.payoutMethod.toUpperCase()}` : ''}
                  </p>
                  <p className="mt-1 text-[11px] text-neutral-400">
                    {new Date(item.at).toLocaleString()}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
