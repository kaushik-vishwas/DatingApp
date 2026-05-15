import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import CallerBottomTabs, { getCallerTabBarContentPadding } from '../../components/caller/CallerBottomTabs';
import { useCallSignals } from '../../context/CallSignalContext';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';
import type { CallerCallHistoryRow } from '../../types/api';
import { resolveProfileImageSource } from '../../utils/avatarSource';
import { SCREEN_FETCH_TIMEOUT_MS, withTimeout } from '../../utils/withTimeout';

type Props = NativeStackScreenProps<CallerStackParamList, 'CallerCalls'>;

export default function CallerCallsTabScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const contentBottomPadding = getCallerTabBarContentPadding(insets.bottom);
  const { startCallInvite } = useCallSignals();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'all' | 'week' | 'month'>('all');
  const [rows, setRows] = useState<CallerCallHistoryRow[]>([]);
  const [callingReceiverId, setCallingReceiverId] = useState<string | null>(null);
  const loadGenRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data } = await withTimeout(profileApi.callerCallHistory(range), SCREEN_FETCH_TIMEOUT_MS);
      if (loadGenRef.current !== id) return;
      setRows(data.calls);
    } catch (e) {
      if (loadGenRef.current !== id) return;
      setError(getErrorMessage(e));
    } finally {
      if (loadGenRef.current === id) setLoading(false);
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

  const onCallFromHistory = (row: CallerCallHistoryRow) => {
    if (callingReceiverId) return;
    setCallingReceiverId(row.receiverId);
    void (async () => {
      try {
        await startCallInvite(row.receiverId, row.receiverName, row.receiverImage ?? null);
      } catch (e: unknown) {
        Alert.alert('Call failed', getErrorMessage(e));
      } finally {
        setCallingReceiverId(null);
      }
    })();
  };

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

      <View style={[styles.listWrap, { paddingBottom: contentBottomPadding, marginBottom: contentBottomPadding }]}>
        {loading ? (
          <ActivityIndicator size="large" color="#7b2cff" />
        ) : error ? (
          <View style={styles.errorBlock}>
            <Text style={styles.errorMsg}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => void load()} activeOpacity={0.85}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emoji}>📞</Text>
            <Text style={styles.head}>No calls yet</Text>
            <Text style={styles.sub}>Your call history will show up here after you connect with someone.</Text>
          </View>
        ) : (
          rows.map((row) => {
            const receiverAvatar = resolveProfileImageSource(row.receiverImage);
            return (
            <View key={row.id} style={styles.row}>
              {receiverAvatar ? (
                <Image source={receiverAvatar} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPh]}>
                  <Text style={styles.avatarTxt}>{row.receiverName.charAt(0) || '?'}</Text>
                </View>
              )}
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
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.callBtn]}
                  onPress={() => onCallFromHistory(row)}
                  disabled={callingReceiverId === row.receiverId}
                  activeOpacity={0.85}
                >
                  <Text style={styles.actionTxt}>
                    {callingReceiverId === row.receiverId ? '…' : '📞'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() =>
                    navigation.navigate('CallerChat', {
                      receiverId: row.receiverId,
                      receiverName: row.receiverName,
                      receiverImage: row.receiverImage,
                    })
                  }
                  activeOpacity={0.85}
                >
                  <Text style={styles.actionTxt}>💬</Text>
                </TouchableOpacity>
              </View>
            </View>
            );
          })
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
  listWrap: { flex: 1, paddingHorizontal: 14 },
  errorBlock: { marginTop: 20, alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  errorMsg: { fontSize: 14, color: '#b91c1c', textAlign: 'center', lineHeight: 22, fontWeight: '700' },
  retryBtn: {
    backgroundColor: '#7b2cff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
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
  avatarPh: { alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 14, fontWeight: '900', color: '#7b2cff' },
  rowName: { fontSize: 14, color: '#111', fontWeight: '800' },
  rowMeta: { marginTop: 2, fontSize: 11, color: '#666', fontWeight: '700' },
  rowAt: { marginTop: 2, fontSize: 10, color: '#999', fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtn: { backgroundColor: '#e7f9ee' },
  actionTxt: { fontSize: 15 },
});
