import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';
import type { ReceiverEarningsBreakdownResponse } from '../../types/api';
import { SCREEN_FETCH_TIMEOUT_MS, withTimeout } from '../../utils/withTimeout';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverEarningsAnalytics'>;

export default function ReceiverEarningsAnalyticsScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReceiverEarningsBreakdownResponse | null>(null);
  const [tab, setTab] = useState<'week' | 'month' | 'all'>('week');
  const loadGenRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data } = await withTimeout(profileApi.receiverEarningsBreakdown(tab), SCREEN_FETCH_TIMEOUT_MS);
      if (loadGenRef.current !== id) return;
      setData(data);
    } catch (e) {
      if (loadGenRef.current !== id) return;
      setError(getErrorMessage(e));
    } finally {
      if (loadGenRef.current === id) setLoading(false);
    }
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const bars = useMemo(() => {
    if (!data) return [];
    return tab === 'week' ? data.analytics.week : tab === 'month' ? data.analytics.month : data.analytics.all;
  }, [data, tab]);

  const maxAmount = Math.max(1, ...bars.map((b) => b.amount));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.tabs}>
        {(['week', 'month', 'all'] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'week' ? 'This Week' : t === 'month' ? 'This Month' : 'All Time'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#7b2cff" style={{ marginTop: 22 }} />
      ) : error ? (
        <View style={styles.errorBlock}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void load()} activeOpacity={0.85}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Weekly Performance</Text>
          {bars.map((row) => (
            <View key={row.label} style={styles.barRow}>
              <Text style={styles.barLabel}>{row.label}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.max(5, (row.amount / maxAmount) * 100)}%` }]} />
              </View>
              <View style={styles.barStats}>
                <Text style={styles.barAmount}>₹{Math.round(row.amount)}</Text>
                <Text style={styles.barCount}>{row.sessions}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f8' },
  screen: { flex: 1, backgroundColor: '#f7f7f8' },
  content: { padding: 16, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 20, color: '#111', fontWeight: '700' },
  headerTitle: { fontSize: 16, color: '#111', fontWeight: '900' },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 7 },
  tabActive: { borderColor: '#7b2cff', backgroundColor: '#f5ecff' },
  tabText: { fontSize: 11, color: '#666', fontWeight: '700' },
  tabTextActive: { color: '#7b2cff' },
  errorBlock: { marginTop: 22, alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  retryBtn: {
    backgroundColor: '#7b2cff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  error: { color: '#b91c1c', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ececec', borderRadius: 12, padding: 12 },
  cardTitle: { fontSize: 13, color: '#111', fontWeight: '900', marginBottom: 8 },
  barRow: { marginBottom: 9 },
  barLabel: { fontSize: 11, color: '#666', fontWeight: '700', marginBottom: 4 },
  barTrack: { height: 5, borderRadius: 3, backgroundColor: '#f0e7ff' },
  barFill: { height: 5, borderRadius: 3, backgroundColor: '#e56dd9' },
  barStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  barAmount: { fontSize: 11, color: '#111', fontWeight: '800' },
  barCount: { fontSize: 11, color: '#666', fontWeight: '700' },
});
