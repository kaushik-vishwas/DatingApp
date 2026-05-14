import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { io, type Socket } from 'socket.io-client';
import { chatApi, getErrorMessage, getJwt, getResolvedApiBaseUrl, profileApi } from '../../services/api';
import { markNotificationsSeenNow } from '../../services/notificationUnread';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { formatCallDurationCompact } from '../../utils/callDurationDisplay';
import { SCREEN_FETCH_TIMEOUT_MS, withTimeout } from '../../utils/withTimeout';

type NotificationKind = 'message' | 'call' | 'withdrawal' | 'earning';
type NotificationRow = {
  id: string;
  title: string;
  subtitle: string;
  at: string;
  type: NotificationKind;
  peerId?: string;
  peerName?: string;
  peerImage?: string | null;
};

export default function ReceiverNotificationsScreen(): React.JSX.Element {
  const navigation = useNavigation<NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverNotifications'>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | NotificationKind>('all');
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const loadGenRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const [{ data: conversations }, { data: calls }, { data: withdrawals }] = await withTimeout(
        Promise.all([
          chatApi.conversations(),
          profileApi.receiverCallInsights('all'),
          profileApi.receiverWithdrawalOverview(),
        ]),
        SCREEN_FETCH_TIMEOUT_MS
      );
      if (loadGenRef.current !== id) return;

      const messageRows: NotificationRow[] = conversations.conversations.map((c) => ({
        id: `msg-${c.peerId}`,
        title: `Message from ${c.peerName}`,
        subtitle: c.lastText || 'You received a new message',
        at: c.lastAt,
        type: 'message',
        peerId: c.peerId,
        peerName: c.peerName,
        peerImage: c.peerImage ?? null,
      }));
      const callRows: NotificationRow[] = calls.recentCalls.map((c) => ({
        id: `call-${c.id}`,
        title: c.durationSec > 0 ? 'Call Completed' : 'Missed Call',
        subtitle: `${c.callerName} • ${formatCallDurationCompact(c.durationSec)}`,
        at: c.startedAt,
        type: 'call',
        peerId: c.callerId,
        peerName: c.callerName,
        peerImage: c.callerImage ?? null,
      }));
      const earningRows: NotificationRow[] = calls.recentCalls.map((c) => ({
        id: `earn-${c.id}`,
        title: 'Daily Earnings Summary',
        subtitle: `You earned ₹${Math.round(c.earningInr)} from a call`,
        at: c.startedAt,
        type: 'earning',
      }));
      const withdrawalRows: NotificationRow[] = withdrawals.recent.map((w) => ({
        id: `wd-${w.id}`,
        title: 'Withdrawal update',
        subtitle: `₹${w.amount} is ${w.status}`,
        at: w.createdAt,
        type: 'withdrawal',
      }));

      const merged = [...messageRows, ...callRows, ...withdrawalRows, ...earningRows].sort(
        (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
      );
      setRows(merged);
    } catch (e) {
      if (loadGenRef.current !== id) return;
      setError(getErrorMessage(e));
    } finally {
      if (loadGenRef.current === id) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void markNotificationsSeenNow('receiver');
      void load();
    }, [load])
  );

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
          const newRow: NotificationRow = {
            id: `missed-live-${payload?.callerId ?? 'unknown'}-${Date.now()}`,
            title: 'Missed Call',
            subtitle: `${callerName} tried to call while you were busy.`,
            at,
            type: 'call',
            peerId: String(payload?.callerId ?? ''),
            peerName: callerName,
            peerImage: payload?.callerImage ?? null,
          };
          setRows((prev) =>
            [newRow, ...prev].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          );
        }
      );
      socket.on(
        'withdrawal:update',
        (payload: {
          withdrawalId?: string;
          amount?: number;
          payoutStatus?: 'processing' | 'success' | 'failed';
          message?: string;
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
          const newRow: NotificationRow = {
            id: `wd-live-${payload.withdrawalId}-${Date.now()}`,
            title: 'Withdrawal update',
            subtitle,
            at,
            type: 'withdrawal',
          };
          setRows((prev) =>
            [newRow, ...prev].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          );
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

  const filtered = useMemo(
    () => (tab === 'all' ? rows : rows.filter((x) => x.type === tab)),
    [rows, tab]
  );

  const openChat = (row: NotificationRow) => {
    if (!row.peerId || !row.peerName) return;
    navigation.navigate('ReceiverChat', {
      userId: row.peerId,
      userName: row.peerName,
      userImage: row.peerImage ?? null,
    });
  };

  const onOpenRow = (row: NotificationRow) => {
    if (row.type === 'withdrawal') {
      navigation.navigate('WithdrawEarnings');
      return;
    }
    if (row.type === 'earning') {
      navigation.navigate('ReceiverEarningsBreakdown');
      return;
    }
    if (row.type === 'message') {
      openChat(row);
      return;
    }
    if (row.type === 'call') {
      openChat(row);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity>
          <Text style={styles.markAll}>Mark all</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {(['all', 'message', 'call', 'earning', 'withdrawal'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'all'
                ? 'All'
                : t === 'message'
                  ? 'Messages'
                  : t === 'call'
                    ? 'Calls'
                    : t === 'earning'
                      ? 'Earnings'
                      : 'Withdrawals'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'earning' ? (
        <View style={styles.earningActions}>
          <TouchableOpacity style={styles.earningBtn} onPress={() => navigation.navigate('ReceiverEarningsBreakdown')}>
            <Text style={styles.earningBtnText}>Open Earnings Breakdown</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.earningBtnOutline} onPress={() => navigation.navigate('ReceiverEarningsAnalytics')}>
            <Text style={styles.earningBtnOutlineText}>Open Analytics</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator size="large" color="#7b2cff" style={{ marginTop: 20 }} />
      ) : error ? (
        <View style={styles.errorBlock}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void load()} activeOpacity={0.85}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <Text style={styles.empty}>No notifications.</Text>
      ) : (
        filtered.map((row) => (
          <TouchableOpacity key={row.id} style={styles.row} activeOpacity={0.88} onPress={() => onOpenRow(row)}>
            <View style={styles.rowTop}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              {row.type === 'call' ? (
                <View style={styles.rowActions}>
                  <TouchableOpacity
                    style={styles.rowActionBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      openChat(row);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.rowActionTxt}>💬</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.rowChev}>›</Text>
              )}
            </View>
            <Text style={styles.rowSub}>{row.subtitle}</Text>
            <Text style={styles.rowAt}>{new Date(row.at).toLocaleString()}</Text>
          </TouchableOpacity>
        ))
      )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f8' },
  screen: { flex: 1, backgroundColor: '#f7f7f8' },
  content: { padding: 16, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 20, color: '#111', fontWeight: '700' },
  headerTitle: { fontSize: 16, color: '#111', fontWeight: '900' },
  markAll: { fontSize: 12, color: '#7b2cff', fontWeight: '800' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: '#ddd', borderRadius: 16, backgroundColor: '#fff' },
  tabActive: { backgroundColor: '#7b2cff', borderColor: '#7b2cff' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#444' },
  tabTextActive: { color: '#fff' },
  errorBlock: { marginTop: 16, alignItems: 'center', gap: 10 },
  retryBtn: {
    backgroundColor: '#7b2cff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  error: { color: '#b91c1c', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  empty: { color: '#666', fontSize: 12, marginTop: 8 },
  row: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#ececec', padding: 10, marginBottom: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowTitle: { color: '#111', fontSize: 13, fontWeight: '800' },
  rowSub: { color: '#555', fontSize: 12, marginTop: 3, fontWeight: '600' },
  rowAt: { color: '#888', fontSize: 10, marginTop: 5, fontWeight: '600' },
  rowChev: { fontSize: 20, color: '#bbb', fontWeight: '300' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowActionTxt: { fontSize: 14 },
  earningActions: { marginBottom: 10, gap: 8 },
  earningBtn: {
    backgroundColor: '#7b2cff',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  earningBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  earningBtnOutline: {
    borderWidth: 1,
    borderColor: '#d7c6ff',
    backgroundColor: '#f9f5ff',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  earningBtnOutlineText: { color: '#7b2cff', fontSize: 12, fontWeight: '800' },
});
