import React, {
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
import { chatApi, getErrorMessage, getJwt, getResolvedApiBaseUrl, profileApi } from '../services/api';
import type { ReceiverCallInsightRow, ReceiverWithdrawalRow } from '../types/api';
import type { ReceiverNotificationKind, ReceiverNotificationRow } from '../types/receiverNotification';
import { formatCallDurationCompact } from '../utils/callDurationDisplay';
import {
  callerOnlineNotificationToRow,
  upsertCallerOnlineNotification,
} from '../utils/receiverCallerOnlineNotifications';
import {
  incompleteCallGroupToNotificationRow,
  missedCallGroupToNotificationRow,
  upsertMissedCallNotification,
} from '../utils/receiverMissedCallNotifications';
import { SCREEN_FETCH_TIMEOUT_MS, withTimeout } from '../utils/withTimeout';

type ReceiverNotificationDataContextValue = {
  rows: ReceiverNotificationRow[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  rowsForTypes: (types: ReceiverNotificationKind[]) => ReceiverNotificationRow[];
};

const ReceiverNotificationDataContext = createContext<ReceiverNotificationDataContextValue | null>(
  null
);

function sortRows(list: ReceiverNotificationRow[]): ReceiverNotificationRow[] {
  return [...list].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function ReceiverNotificationDataProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReceiverNotificationRow[]>([]);
  const loadGenRef = useRef(0);

  const reload = useCallback(async () => {
    const id = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const settled = await withTimeout(
        Promise.allSettled([
          chatApi.conversations(),
          profileApi.receiverCallInsights('all'),
          profileApi.receiverWithdrawalOverview(),
          profileApi.receiverCallerOnlineNotifications(),
        ]),
        SCREEN_FETCH_TIMEOUT_MS
      );
      if (loadGenRef.current !== id) return;

      const [convR, callsR, wdR, onlineR] = settled;
      const anyOk =
        convR.status === 'fulfilled' ||
        callsR.status === 'fulfilled' ||
        wdR.status === 'fulfilled' ||
        onlineR.status === 'fulfilled';
      if (!anyOk) {
        const firstErr =
          convR.status === 'rejected'
            ? convR.reason
            : callsR.status === 'rejected'
              ? callsR.reason
              : wdR.reason;
        setError(getErrorMessage(firstErr));
        setRows([]);
        return;
      }

      const conversations = convR.status === 'fulfilled' ? convR.value.data.conversations : [];
      const callInsights = callsR.status === 'fulfilled' ? callsR.value.data : null;
      const recentCalls: ReceiverCallInsightRow[] = callInsights?.recentCalls ?? [];
      const missedCallGroups = callInsights?.missedCallGroups ?? [];
      const incompleteCallGroups = callInsights?.incompleteCallGroups ?? [];
      const withdrawalRecent: ReceiverWithdrawalRow[] =
        wdR.status === 'fulfilled' ? wdR.value.data.recent : [];
      const callerOnlineRows =
        onlineR.status === 'fulfilled' ? onlineR.value.data.notifications : [];

      const messageRows: ReceiverNotificationRow[] = conversations.map((c) => ({
        id: `msg-${c.peerId}`,
        title: `Message from ${c.peerName}`,
        subtitle: c.lastText || 'You received a new message',
        at: c.lastAt,
        type: 'message',
        peerId: c.peerId,
        peerName: c.peerName,
        peerImage: c.peerImage ?? null,
      }));
      const callRows: ReceiverNotificationRow[] = [
        ...callerOnlineRows.map(callerOnlineNotificationToRow),
        ...missedCallGroups.map(missedCallGroupToNotificationRow),
        ...incompleteCallGroups.map(incompleteCallGroupToNotificationRow),
        ...recentCalls.map((c) => ({
          id: `call-${c.id}`,
          title: 'Call Completed',
          subtitle: `${c.callerName} • ${formatCallDurationCompact(c.durationSec)}`,
          at: c.startedAt,
          type: 'call' as const,
          peerId: c.callerId,
          peerName: c.callerName,
          peerImage: c.callerImage ?? null,
        })),
      ];
      const earningRows: ReceiverNotificationRow[] = recentCalls.map((c) => ({
        id: `earn-${c.id}`,
        title: 'Daily Earnings Summary',
        subtitle: `You earned ₹${Math.round(c.earningInr)} from a call`,
        at: c.startedAt,
        type: 'earning',
      }));
      const withdrawalRows: ReceiverNotificationRow[] = withdrawalRecent.map((w) => ({
        id: `wd-${w.id}`,
        title: 'Withdrawal update',
        subtitle: `₹${w.amount} is ${w.status}`,
        at: w.createdAt,
        type: 'withdrawal',
      }));

      setRows(
        sortRows([...messageRows, ...callRows, ...withdrawalRows, ...earningRows])
      );
      setError(null);
    } catch (e) {
      if (loadGenRef.current !== id) return;
      setError(getErrorMessage(e));
    } finally {
      if (loadGenRef.current === id) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    const base = getResolvedApiBaseUrl();
    let socket: Socket | null = null;
    void (async () => {
      const token = await getJwt();
      if (!token || cancelled) return;
      socket = io(base, {
        auth: { token },
        transports: ['polling', 'websocket'],
        timeout: 20000,
      });
      socket.on(
        'caller:online',
        (payload: {
          id?: string;
          callerIds?: string[];
          callerName?: string;
          callerImage?: string | null;
          title?: string;
          subtitle?: string;
          at?: string;
        }) => {
          setRows((prev) => sortRows(upsertCallerOnlineNotification(prev, payload)));
        }
      );
      socket.on(
        'call:missed',
        (payload: { callerId: string; callerName?: string; callerImage?: string | null; at?: string }) => {
          const at =
            typeof payload?.at === 'string' && payload.at.trim()
              ? payload.at
              : new Date().toISOString();
          const callerName =
            typeof payload?.callerName === 'string' && payload.callerName.trim()
              ? payload.callerName.trim()
              : 'Caller';
          setRows((prev) =>
            sortRows(
              upsertMissedCallNotification(prev, {
                callerId: String(payload?.callerId ?? ''),
                callerName,
                callerImage: payload?.callerImage ?? null,
                at,
              })
            )
          );
        }
      );
      socket.on(
        'withdrawal:update',
        (payload: {
          withdrawalId?: string;
          amount?: number;
          payoutStatus?: 'processing' | 'success' | 'failed';
          at?: string;
        }) => {
          if (!payload?.withdrawalId || !payload.payoutStatus) return;
          const at =
            typeof payload?.at === 'string' && payload.at.trim()
              ? payload.at
              : new Date().toISOString();
          const amount = Number(payload.amount ?? 0);
          const subtitle =
            payload.payoutStatus === 'success'
              ? `₹${Math.round(amount)} payout successful`
              : payload.payoutStatus === 'failed'
                ? `₹${Math.round(amount)} payout failed`
                : `₹${Math.round(amount)} payout processing`;
          const newRow: ReceiverNotificationRow = {
            id: `wd-live-${payload.withdrawalId}-${Date.now()}`,
            title: 'Withdrawal update',
            subtitle,
            at,
            type: 'withdrawal',
          };
          setRows((prev) => sortRows([newRow, ...prev]));
        }
      );
    })();

    return () => {
      cancelled = true;
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
    };
  }, []);

  const rowsForTypes = useCallback(
    (types: ReceiverNotificationKind[]) => {
      if (types.length === 0) return rows;
      const set = new Set(types);
      return rows.filter((r) => set.has(r.type));
    },
    [rows]
  );

  const value = useMemo(
    () => ({ rows, loading, error, reload, rowsForTypes }),
    [rows, loading, error, reload, rowsForTypes]
  );

  return (
    <ReceiverNotificationDataContext.Provider value={value}>
      {children}
    </ReceiverNotificationDataContext.Provider>
  );
}

export function useReceiverNotificationData(): ReceiverNotificationDataContextValue {
  const ctx = useContext(ReceiverNotificationDataContext);
  if (!ctx) {
    throw new Error('useReceiverNotificationData must be used within ReceiverNotificationDataProvider');
  }
  return ctx;
}
