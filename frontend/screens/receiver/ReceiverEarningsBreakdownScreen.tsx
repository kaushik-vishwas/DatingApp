import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';
import type { ReceiverEarningsBreakdownResponse } from '../../types/api';
import { SCREEN_FETCH_TIMEOUT_MS, withTimeout } from '../../utils/withTimeout';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverEarningsBreakdown'>;

function formatInr(n: number): string {
  const v = Math.round(n * 100) / 100;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export default function ReceiverEarningsBreakdownScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReceiverEarningsBreakdownResponse | null>(null);
  const loadGenRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data } = await withTimeout(profileApi.receiverEarningsBreakdown('all'), SCREEN_FETCH_TIMEOUT_MS);
      if (loadGenRef.current !== id) return;
      setData(data);
    } catch (e) {
      if (loadGenRef.current !== id) return;
      setError(getErrorMessage(e));
    } finally {
      if (loadGenRef.current === id) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Earnings Breakdown</Text>
        <TouchableOpacity onPress={() => navigation.navigate('ReceiverEarningsAnalytics')}>
          <Text style={styles.analyticsLink}>Analytics</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#7b2cff" style={{ marginTop: 20 }} />
      ) : error ? (
        <View style={styles.errorBlock}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void load()} activeOpacity={0.85}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : data ? (
        <>
          <View style={styles.rowTop}>
            <StatCard
              label="Total Calls"
              value={String(data.stats.totalCalls)}
              note={`${Math.round(data.stats.totalMinutes)} minutes`}
            />
            <StatCard
              label="Avg Call"
              value={`${Math.round(data.stats.avgCallMinutes)} min`}
              note="per call"
            />
          </View>
          {(() => {
            const lifetime = data.lifetime;
            const chatEarnings = Math.max(
              0,
              lifetime?.chatEarnings ?? data.stats.chatEarnings ?? 0
            );
            const callEarnings = Math.max(
              0,
              lifetime?.callEarnings ??
                data.stats.callEarnings ??
                Math.round((data.stats.netEarnings - chatEarnings) * 100) / 100
            );
            const total = Math.max(
              0,
              lifetime?.totalEarnings ?? Math.round((callEarnings + chatEarnings) * 100) / 100
            );
            return (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Total earnings</Text>
                <Line label="Earnings from calls" value={formatInr(callEarnings)} />
                <Line label="Earnings from chat" value={formatInr(chatEarnings)} />
                <View style={styles.totalDivider} />
                <Line label="Total" value={formatInr(total)} strong />
                <TouchableOpacity style={styles.detailsBtn} onPress={() => navigation.navigate('ReceiverEarningsAnalytics')}>
                  <Text style={styles.detailsText}>View analytics</Text>
                </TouchableOpacity>
              </View>
            );
          })()}

        

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Call History</Text>
          </View>

          {data.entries.map((row) => (
            <View key={row.id} style={styles.entryCard}>
              <View style={styles.entryHeader}>
                <Text style={styles.entryName}>{row.title}</Text>
                <Text style={styles.entryStatus}>{row.status}</Text>
              </View>
              <Text style={styles.entryAt}>{new Date(row.createdAt).toLocaleString()}</Text>
              <Line label="Duration" value={`${row.durationMin} min`} compact />
              <Line label="You earned" value={formatInr(row.netEarning)} compact strong />
            </View>
          ))}
        </>
      ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statNote}>{note}</Text>
    </View>
  );
}

function Line({
  label,
  value,
  danger,
  strong,
  compact,
}: {
  label: string;
  value: string;
  danger?: boolean;
  strong?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={[styles.lineRow, compact && { marginTop: 5 }]}>
      <Text style={[styles.lineLabel, strong && { fontWeight: '800' }]}>{label}</Text>
      <Text style={[styles.lineValue, danger && { color: '#dc2626' }, strong && { fontSize: 21 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f8' },
  screen: { flex: 1, backgroundColor: '#f7f7f8' },
  content: { padding: 16, paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 20, color: '#111', fontWeight: '700' },
  headerTitle: { fontSize: 16, color: '#111', fontWeight: '900' },
  analyticsLink: { fontSize: 12, color: '#7b2cff', fontWeight: '800' },
  errorBlock: { marginTop: 20, alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  retryBtn: {
    backgroundColor: '#7b2cff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  error: { color: '#b91c1c', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  rowTop: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#ececec', padding: 10 },
  statLabel: { fontSize: 11, color: '#777', fontWeight: '700' },
  statValue: { marginTop: 3, fontSize: 24, color: '#111', fontWeight: '900' },
  statNote: { marginTop: 2, fontSize: 10, color: '#999', fontWeight: '600' },
  summaryCard: { marginTop: 10, backgroundColor: '#e97cdd', borderRadius: 12, borderWidth: 1, borderColor: '#d85ec8', padding: 12 },
  summaryTitle: { fontSize: 14, color: '#4b1f45', fontWeight: '900', marginBottom: 8 },
  totalDivider: {
    marginTop: 10,
    marginBottom: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(75, 31, 69, 0.25)',
  },
  lineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  lineLabel: { fontSize: 12, color: '#4b1f45', fontWeight: '700' },
  lineValue: { fontSize: 18, color: '#241824', fontWeight: '900' },
  detailsBtn: { marginTop: 12, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.32)', alignItems: 'center', paddingVertical: 8 },
  detailsText: { fontSize: 12, color: '#4b1f45', fontWeight: '800' },
  sectionRow: { marginTop: 12, marginBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, color: '#111', fontWeight: '900' },
  entryCard: { backgroundColor: '#fff', borderRadius: 11, borderWidth: 1, borderColor: '#ececec', padding: 11, marginBottom: 8 },
  entryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  entryName: { fontSize: 14, color: '#111', fontWeight: '800' },
  entryStatus: { fontSize: 11, color: '#16a34a', fontWeight: '800' },
  entryAt: { marginTop: 2, fontSize: 10, color: '#999', fontWeight: '600', marginBottom: 4 },
});
