import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';
import type { ReceiverCallInsightsResponse } from '../../types/api';
import { formatCallDurationCompact, leaderboardMinutesFromSeconds } from '../../utils/callDurationDisplay';
import { SCREEN_FETCH_TIMEOUT_MS, withTimeout } from '../../utils/withTimeout';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverCallHistory'>;
type RangeTab = 'all' | 'week' | 'month';

export default function ReceiverCallHistoryScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const [tab, setTab] = useState<RangeTab>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReceiverCallInsightsResponse | null>(null);
  const loadGenRef = useRef(0);

  const load = useCallback(async (range: RangeTab) => {
    const id = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await withTimeout(profileApi.receiverCallInsights(range), SCREEN_FETCH_TIMEOUT_MS);
      if (loadGenRef.current !== id) return;
      setData(res);
    } catch (e) {
      if (loadGenRef.current !== id) return;
      setError(getErrorMessage(e));
    } finally {
      if (loadGenRef.current === id) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(tab);
    }, [load, tab])
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Call History</Text>
        <View style={{ width: 14 }} />
      </View>

      <View style={styles.tabs}>
        {(['all', 'week', 'month'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'all' ? 'All' : t === 'week' ? 'This Week' : 'This Month'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#7b2cff" style={{ marginTop: 24 }} />
      ) : error ? (
        <View style={styles.errorBlock}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void load(tab)} activeOpacity={0.85}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : data ? (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryText}>
              Total: {leaderboardMinutesFromSeconds(data.leaderboard.totalDurationSec)} min
            </Text>
            <Text style={styles.summaryText}>
              Week: {leaderboardMinutesFromSeconds(data.leaderboard.thisWeekDurationSec)} min
            </Text>
            <Text style={styles.summaryText}>
              Month: {leaderboardMinutesFromSeconds(data.leaderboard.thisMonthDurationSec)} min
            </Text>
          </View>

          <Text style={styles.section}>Caller-wise history</Text>
          {data.callerHistory.length === 0 ? (
            <Text style={styles.empty}>No caller history yet.</Text>
          ) : (
            data.callerHistory.map((row) => (
              <View key={row.callerId} style={styles.rowCard}>
                <Text style={styles.name}>{row.callerName}</Text>
                <Text style={styles.meta}>This week: {row.callsWeek} calls • {formatCallDurationCompact(row.durationWeekSec)}</Text>
                <Text style={styles.meta}>This month: {row.callsMonth} calls • {formatCallDurationCompact(row.durationMonthSec)}</Text>
                <Text style={styles.meta}>Rating received: {row.avgRating ?? 'N/A'}</Text>
              </View>
            ))
          )}

          <Text style={styles.section}>Recent calls</Text>
          {data.recentCalls.length === 0 ? (
            <Text style={styles.empty}>No calls in selected range.</Text>
          ) : (
            data.recentCalls.map((row) => (
              <View key={row.id} style={styles.rowCard}>
                <Text style={styles.name}>{row.callerName}</Text>
                <Text style={styles.meta}>{new Date(row.startedAt).toLocaleString()}</Text>
                <Text style={styles.meta}>Duration: {formatCallDurationCompact(row.durationSec)}</Text>
                <Text style={styles.meta}>Rating: {row.rating ?? 'N/A'}</Text>
              </View>
            ))
          )}
        </>
      ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8f8f8' },
  screen: { flex: 1, backgroundColor: '#f8f8f8' },
  content: { padding: 16, paddingBottom: 32 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { fontSize: 20, color: '#111', fontWeight: '700' },
  title: { fontSize: 20, color: '#111', fontWeight: '800' },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 14 },
  tabBtn: { borderRadius: 18, borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  tabBtnActive: { backgroundColor: '#7b2cff', borderColor: '#7b2cff' },
  tabText: { fontSize: 12, color: '#444', fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  errorBlock: { marginTop: 24, alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  retryBtn: {
    backgroundColor: '#7b2cff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  error: { marginTop: 0, color: '#b91c1c', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  summaryCard: { marginTop: 14, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#eee', padding: 12, gap: 4 },
  summaryText: { color: '#222', fontSize: 12, fontWeight: '700' },
  section: { marginTop: 14, marginBottom: 8, fontSize: 14, color: '#111', fontWeight: '800' },
  empty: { fontSize: 12, color: '#666' },
  rowCard: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#ececec', padding: 10, marginBottom: 8 },
  name: { fontSize: 13, color: '#111', fontWeight: '800' },
  meta: { marginTop: 3, fontSize: 11, color: '#666', fontWeight: '600' },
});
