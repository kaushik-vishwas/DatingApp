import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getErrorMessage, profileApi } from '../../services/api';
import type { ReceiverCallInsightsResponse } from '../../types/api';
import { formatCallDurationCompact } from '../../utils/callDurationDisplay';
import { SCREEN_FETCH_TIMEOUT_MS, withTimeout } from '../../utils/withTimeout';

type RangeTab = 'all' | 'week' | 'month';
const HISTORY_REFRESH_THROTTLE_MS = 12_000;

type Props = {
  /** When true, only the recent calls list is shown (no summary / caller breakdown). */
  callsOnly?: boolean;
  scrollPaddingBottom?: number;
};

export default function ReceiverCallHistoryContent({
  callsOnly = true,
  scrollPaddingBottom = 24,
}: Props): React.JSX.Element {
  const [tab, setTab] = useState<RangeTab>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReceiverCallInsightsResponse | null>(null);
  const loadGenRef = useRef(0);
  const lastLoadedAtRef = useRef<Record<RangeTab, number>>({
    all: 0,
    week: 0,
    month: 0,
  });

  const load = useCallback(async (range: RangeTab, opts?: { force?: boolean }) => {
    const force = Boolean(opts?.force);
    const now = Date.now();
    if (!force && now - lastLoadedAtRef.current[range] < HISTORY_REFRESH_THROTTLE_MS) {
      return;
    }
    const id = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await withTimeout(
        profileApi.receiverCallInsights(range),
        SCREEN_FETCH_TIMEOUT_MS
      );
      if (loadGenRef.current !== id) return;
      setData(res);
      lastLoadedAtRef.current[range] = Date.now();
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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: scrollPaddingBottom }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.tabs}>
        {(['all', 'week', 'month'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.85}
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
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => void load(tab, { force: true })}
            activeOpacity={0.85}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : data ? (
        <>
          {!callsOnly ? (
            <>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryText}>
                  Total: {Math.round(data.leaderboard.totalMinutes)} min
                </Text>
                <Text style={styles.summaryText}>
                  Week: {Math.round(data.leaderboard.thisWeekMinutes)} min
                </Text>
                <Text style={styles.summaryText}>
                  Month: {Math.round(data.leaderboard.thisMonthMinutes)} min
                </Text>
              </View>
              <Text style={styles.section}>Caller-wise history</Text>
              {data.callerHistory.length === 0 ? (
                <Text style={styles.empty}>No caller history yet.</Text>
              ) : (
                data.callerHistory.map((row) => (
                  <View key={row.callerId} style={styles.rowCard}>
                    <Text style={styles.name}>{row.callerName}</Text>
                    <Text style={styles.meta}>
                      This week: {row.callsWeek} calls •{' '}
                      {formatCallDurationCompact(row.durationWeekSec)}
                    </Text>
                    <Text style={styles.meta}>
                      This month: {row.callsMonth} calls •{' '}
                      {formatCallDurationCompact(row.durationMonthSec)}
                    </Text>
                    <Text style={styles.meta}>Rating received: {row.avgRating ?? 'N/A'}</Text>
                  </View>
                ))
              )}
            </>
          ) : null}

          {(data.missedCallGroups?.length ?? 0) > 0 ? (
            <>
              <Text style={styles.section}>Missed calls</Text>
              {data.missedCallGroups.map((group) => (
                <View key={`missed-${group.callerId}`} style={[styles.rowCard, styles.missedCard]}>
                  <Text style={styles.name}>
                    {group.callerName}
                    {group.missedCount > 1 ? ` (${group.missedCount})` : ''}
                  </Text>
                  <Text style={styles.meta}>
                    {group.missedCount > 1
                      ? `${group.missedCount} missed calls`
                      : 'Missed call · not picked'}
                  </Text>
                  <Text style={styles.meta}>{new Date(group.lastAt).toLocaleString()}</Text>
                </View>
              ))}
            </>
          ) : null}

          {(data.incompleteCallGroups?.length ?? 0) > 0 ? (
            <>
              <Text style={styles.section}>Incomplete calls</Text>
              {data.incompleteCallGroups.map((group) => (
                <View key={`incomplete-${group.callerId}`} style={[styles.rowCard, styles.missedCard]}>
                  <Text style={styles.name}>
                    {group.callerName}
                    {group.incompleteCount > 1 ? ` (${group.incompleteCount})` : ''}
                  </Text>
                  <Text style={styles.meta}>
                    {group.incompleteCount > 1
                      ? `${group.incompleteCount} incomplete calls`
                      : `Incomplete · ${formatCallDurationCompact(group.lastDurationSec)}`}
                  </Text>
                  <Text style={styles.meta}>{new Date(group.lastAt).toLocaleString()}</Text>
                </View>
              ))}
            </>
          ) : null}

          {callsOnly ? null : <Text style={styles.section}>Recent calls</Text>}
          {data.recentCalls.length === 0 &&
          (data.missedCallGroups?.length ?? 0) === 0 &&
          (data.incompleteCallGroups?.length ?? 0) === 0 ? (
            <Text style={styles.empty}>No calls in selected range.</Text>
          ) : data.recentCalls.length === 0 ? (
            callsOnly ? null : <Text style={styles.empty}>No completed calls in selected range.</Text>
          ) : (
            data.recentCalls.map((row) => (
              <View key={row.id} style={styles.rowCard}>
                <Text style={styles.name}>{row.callerName}</Text>
                <Text style={styles.meta}>{new Date(row.startedAt).toLocaleString()}</Text>
                <Text style={styles.meta}>
                  Talk time: {formatCallDurationCompact(row.durationSec)}
                  {row.earningInr > 0 ? ` • ₹${Math.round(row.earningInr)} earned` : ''}
                </Text>
                {row.rating != null ? (
                  <Text style={styles.meta}>Rating: {row.rating}</Text>
                ) : null}
              </View>
            ))
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tabBtn: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
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
  error: { color: '#b91c1c', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  summaryCard: {
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 12,
    gap: 4,
  },
  summaryText: { color: '#222', fontSize: 12, fontWeight: '700' },
  section: { marginTop: 14, marginBottom: 8, fontSize: 14, color: '#111', fontWeight: '800' },
  empty: { fontSize: 12, color: '#666', marginTop: 8 },
  rowCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ececec',
    padding: 10,
    marginBottom: 8,
  },
  missedCard: {
    borderColor: '#fcd34d',
    backgroundColor: '#fffbeb',
  },
  name: { fontSize: 13, color: '#111', fontWeight: '800' },
  meta: { marginTop: 3, fontSize: 11, color: '#666', fontWeight: '600' },
});
