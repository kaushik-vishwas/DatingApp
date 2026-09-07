import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { fetchWithdrawals } from '../api/client';
import { useAdminAuth } from './AdminAuthContext';

const SEEN_KEY = 'adminWithdrawalNotifSeenIds';
const API_ORIGIN = (() => {
  if (import.meta.env.PROD) return 'https://backend.nesthamapp.com';
  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '').replace(/\/auth$/, '');
  return 'http://127.0.0.1:5000';
})();

export type AdminWithdrawalNotification = {
  id: string;
  receiverName: string;
  amount: number;
  payoutAmount: number;
  payoutMethod: 'upi' | 'bank' | null;
  message: string;
  at: string;
};

type AdminNotificationsContextValue = {
  items: AdminWithdrawalNotification[];
  unreadCount: number;
  markAllSeen: () => void;
  markSeen: (id: string) => void;
};

const AdminNotificationsContext = createContext<AdminNotificationsContextValue | null>(null);

function readSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function writeSeenIds(ids: Set<string>): void {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-200)));
}

export function AdminNotificationsProvider({ children }: { children: ReactNode }) {
  const { token } = useAdminAuth();
  const [items, setItems] = useState<AdminWithdrawalNotification[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => readSeenIds());
  const socketRef = useRef<Socket | null>(null);

  const upsert = useCallback((next: AdminWithdrawalNotification) => {
    setItems((prev) => {
      if (prev.some((p) => p.id === next.id)) {
        return prev.map((p) => (p.id === next.id ? next : p));
      }
      return [next, ...prev].slice(0, 40);
    });
  }, []);

  const loadPending = useCallback(async () => {
    try {
      const data = await fetchWithdrawals({ range: 'all', status: 'pending', page: 1 });
      const mapped: AdminWithdrawalNotification[] = data.rows.map((row) => ({
        id: row._id,
        receiverName: row.receiverName,
        amount: row.amount,
        payoutAmount:
          typeof row.payoutAmount === 'number' && row.payoutAmount > 0
            ? row.payoutAmount
            : Math.max(0, row.amount - Number(row.platformFee || 0)),
        payoutMethod: row.payoutMethod ?? null,
        message: 'Withdrawal request awaiting review.',
        at: row.createdAt,
      }));
      setItems(
        mapped.sort((a, b) => +new Date(b.at) - +new Date(a.at))
      );
    } catch {
      // keep existing list
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setItems([]);
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    void loadPending();
    const poll = window.setInterval(() => void loadPending(), 30000);

    const socket = io(API_ORIGIN, {
      auth: { token },
      transports: ['polling', 'websocket'],
      timeout: 20000,
    });
    socketRef.current = socket;

    socket.on(
      'admin:withdrawal_requested',
      (payload: {
        withdrawalId?: string;
        amount?: number;
        payoutAmount?: number;
        receiverName?: string;
        payoutMethod?: 'upi' | 'bank' | null;
        message?: string;
        at?: string;
      }) => {
        if (!payload?.withdrawalId) return;
        upsert({
          id: String(payload.withdrawalId),
          receiverName: String(payload.receiverName ?? 'Receiver'),
          amount: Number(payload.amount ?? 0),
          payoutAmount: Number(payload.payoutAmount ?? payload.amount ?? 0),
          payoutMethod: payload.payoutMethod ?? null,
          message: String(payload.message ?? 'New withdrawal request awaiting review.'),
          at: payload.at ?? new Date().toISOString(),
        });
      }
    );

    return () => {
      window.clearInterval(poll);
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [token, loadPending, upsert]);

  const unreadCount = useMemo(
    () => items.filter((item) => !seenIds.has(item.id)).length,
    [items, seenIds]
  );

  const markAllSeen = useCallback(() => {
    setSeenIds((prev) => {
      const next = new Set(prev);
      for (const item of items) next.add(item.id);
      writeSeenIds(next);
      return next;
    });
  }, [items]);

  const markSeen = useCallback((id: string) => {
    setSeenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      writeSeenIds(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ items, unreadCount, markAllSeen, markSeen }),
    [items, unreadCount, markAllSeen, markSeen]
  );

  return (
    <AdminNotificationsContext.Provider value={value}>{children}</AdminNotificationsContext.Provider>
  );
}

export function useAdminNotifications(): AdminNotificationsContextValue {
  const ctx = useContext(AdminNotificationsContext);
  if (!ctx) {
    throw new Error('useAdminNotifications must be used within AdminNotificationsProvider');
  }
  return ctx;
}
