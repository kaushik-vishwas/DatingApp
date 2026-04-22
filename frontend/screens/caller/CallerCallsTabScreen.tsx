import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CallerBottomTabs from '../../components/caller/CallerBottomTabs';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';
import type { CallerCallHistoryRow } from '../../types/api';

type Props = NativeStackScreenProps<CallerStackParamList, 'CallerCalls'>;

export default function CallerCallsTabScreen({ navigation }: Props): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'all' | 'week' | 'month'>('all');
  const [rows, setRows] = useState<CallerCallHistoryRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await profileApi.callerCallHistory(range);
      setRows(data.calls);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const statusTone = useMemo(
    () => ({
      completed: '#17a34a',
      missed: '#6b7280',
      failed: '#dc2626',
    }),
    []
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Text style={styles.title}>Calls</Text>
      <View style={styles.filters}>
        {(['all', 'week', 'month'] as const).map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.filterBtn, range === r && styles.filterBtnActive]}
            onPress={() => setRange(r)}
          >
            <Text style={[styles.filterText, range === r && styles.filterTextActive]}>
              {r === 'all' ? 'All' : r === 'week' ? 'This Week' : 'This Month'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.listWrap}>
        {loading ? (
          <ActivityIndicator size="large" color="#7b2cff" />
        ) : error ? (
          <Text style={styles.sub}>{error}</Text>
        ) : rows.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emoji}>📞</Text>
            <Text style={styles.head}>No calls yet</Text>
            <Text style={styles.sub}>Your call history will show up here after you connect with someone.</Text>
          </View>
        ) : (
          rows.map((row) => (
            <View key={row.id} style={styles.row}>
              <View style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{row.receiverName}</Text>
                <Text style={styles.rowMeta}>
                  {Math.max(0, row.durationSec)}s •{' '}
                  <Text style={{ color: statusTone[row.status], fontWeight: '800' }}>
                    {row.status[0].toUpperCase() + row.status.slice(1)}
                  </Text>
                </Text>
                <Text style={styles.rowAt}>{new Date(row.startedAt).toLocaleString()}</Text>
              </View>
              <Text style={styles.msgIcon}>💬</Text>
            </View>
          ))
        )}
      </View>
      <CallerBottomTabs active="calls" navigation={navigation} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7' },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111',
    textAlign: 'center',
    paddingVertical: 16,
  },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginBottom: 8 },
  filterBtn: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 16,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterBtnActive: { borderColor: '#7b2cff', backgroundColor: '#f5ecff' },
  filterText: { fontSize: 11, color: '#666', fontWeight: '700' },
  filterTextActive: { color: '#7b2cff' },
  listWrap: { flex: 1, paddingHorizontal: 14, paddingBottom: 88 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emoji: { fontSize: 48, marginBottom: 16 },
  head: { fontSize: 18, fontWeight: '900', color: '#111', marginBottom: 8 },
  sub: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22 },
  row: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(123,44,255,0.2)' },
  rowName: { fontSize: 14, color: '#111', fontWeight: '800' },
  rowMeta: { marginTop: 2, fontSize: 11, color: '#666', fontWeight: '700' },
  rowAt: { marginTop: 2, fontSize: 10, color: '#999', fontWeight: '600' },
  msgIcon: { fontSize: 16 },
});
