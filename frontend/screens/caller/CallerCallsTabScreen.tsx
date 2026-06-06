import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CallerTabScreenHeader from '../../components/caller/CallerTabScreenHeader';
import { CALLER_MESSAGE_REQUIRES_CALL } from '../../constants/callerMessaging';
import { useCallerMessageEligibility } from '../../context/CallerMessageEligibilityContext';
import { useCallSignals } from '../../context/CallSignalContext';
import { useCallerAppNavigation } from '../../utils/callerAppNavigation';
import { useReceiverTabBarBottomInset } from '../../utils/receiverTabBarInset';
import { getErrorMessage, profileApi } from '../../services/api';
import type { CallerCallHistoryRow } from '../../types/api';
import { callerCallMetaLine, callerCallStatusLabel } from '../../utils/callerCallLabels';
import { resolveProfileImageSource } from '../../utils/avatarSource';
import { SCREEN_FETCH_TIMEOUT_MS, withTimeout } from '../../utils/withTimeout';

export default function CallerCallsTabScreen(): React.JSX.Element {
  const navigation = useCallerAppNavigation();
  const scrollPaddingBottom = useReceiverTabBarBottomInset();
  const { canMessageReceiver } = useCallerMessageEligibility();
  const { startCallInvite } = useCallSignals();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'all' | 'week' | 'month'>('all');
  const [rows, setRows] = useState<CallerCallHistoryRow[]>([]);
  const [callingReceiverId, setCallingReceiverId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
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

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const selectedCount = selectedIds.size;

  const onToggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(rows.map((row) => row.id)));
  };

  const onDeleteSelected = () => {
    if (selectedCount === 0 || deleting) return;
    Alert.alert(
      'Delete calls',
      selectedCount === 1
        ? 'Remove this call from Recents?'
        : `Remove ${selectedCount} calls from Recents?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            void (async () => {
              try {
                await profileApi.deleteCallerCallHistory([...selectedIds]);
                setRows((prev) => prev.filter((row) => !selectedIds.has(row.id)));
                exitSelectMode();
              } catch (e) {
                Alert.alert('Delete failed', getErrorMessage(e));
              } finally {
                setDeleting(false);
              }
            })();
          },
        },
      ]
    );
  };

  const statusTone = useMemo(
    () => ({
      completed: '#17a34a',
      missed: '#6b7280',
      incomplete: '#d97706',
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
      <CallerTabScreenHeader title="Recents" subtitle="Your calls" backTarget="home" />
      <View style={styles.filtersRow}>
        <View style={styles.filters}>
          {(['all', 'week', 'month'] as const).map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.filterBtn, range === r && styles.filterBtnActive]}
              onPress={() => {
                if (selectMode) exitSelectMode();
                setRange(r);
              }}
              disabled={selectMode}
            >
              <Text style={[styles.filterText, range === r && styles.filterTextActive]}>
                {r === 'all' ? 'All' : r === 'week' ? 'This Week' : 'This Month'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {!loading && !error && rows.length > 0 ? (
          selectMode ? (
            <View style={styles.selectActions}>
              <TouchableOpacity onPress={exitSelectMode} activeOpacity={0.85}>
                <Text style={styles.selectActionText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onDeleteSelected}
                disabled={selectedCount === 0 || deleting}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.selectActionText,
                    styles.deleteActionText,
                    (selectedCount === 0 || deleting) && styles.selectActionDisabled,
                  ]}
                >
                  {deleting ? 'Deleting…' : `Delete${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setSelectMode(true)} activeOpacity={0.85}>
              <Text style={styles.selectActionText}>Select</Text>
            </TouchableOpacity>
          )
        ) : null}
      </View>

      {selectMode && rows.length > 0 ? (
        <TouchableOpacity style={styles.selectAllRow} onPress={onToggleSelectAll} activeOpacity={0.85}>
          <View style={[styles.checkbox, allVisibleSelected && styles.checkboxChecked]}>
            {allVisibleSelected ? <Text style={styles.checkboxMark}>✓</Text> : null}
          </View>
          <Text style={styles.selectAllText}>{allVisibleSelected ? 'Deselect all' : 'Select all'}</Text>
        </TouchableOpacity>
      ) : null}

      <ScrollView
        style={styles.listWrap}
        contentContainerStyle={{ paddingBottom: scrollPaddingBottom }}
        showsVerticalScrollIndicator={false}
      >
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
            <Text style={styles.sub}>Your call history will show talk time here after you connect with someone.</Text>
          </View>
        ) : (
          rows.map((row) => {
            const receiverAvatar = resolveProfileImageSource(row.receiverImage);
            const canMessage = canMessageReceiver(row.receiverId);
            const isSelected = selectedIds.has(row.id);
            return (
            <TouchableOpacity
              key={row.id}
              style={[styles.row, selectMode && isSelected && styles.rowSelected]}
              onPress={selectMode ? () => toggleSelected(row.id) : undefined}
              activeOpacity={selectMode ? 0.85 : 1}
              disabled={!selectMode}
            >
              {selectMode ? (
                <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                  {isSelected ? <Text style={styles.checkboxMark}>✓</Text> : null}
                </View>
              ) : null}
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
                  {callerCallMetaLine(row.durationSec, row.status)} •{' '}
                  <Text style={{ color: statusTone[row.status], fontWeight: '800' }}>
                    {callerCallStatusLabel(row.status)}
                  </Text>
                </Text>
                <Text style={styles.rowAt}>{new Date(row.startedAt).toLocaleString()}</Text>
              </View>
              {!selectMode ? (
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
                  style={[styles.actionBtn, !canMessage && styles.actionBtnDisabled]}
                  onPress={() => {
                    if (!canMessage) {
                      Alert.alert('Messaging locked', CALLER_MESSAGE_REQUIRES_CALL);
                      return;
                    }
                    navigation.navigate('CallerChat', {
                      receiverId: row.receiverId,
                      receiverName: row.receiverName,
                      receiverImage: row.receiverImage,
                    });
                  }}
                  activeOpacity={canMessage ? 0.85 : 1}
                  disabled={!canMessage}
                >
                  <Text style={[styles.actionTxt, !canMessage && styles.actionTxtDisabled]}>💬</Text>
                </TouchableOpacity>
              </View>
              ) : null}
            </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7' },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 8,
  },
  filters: { flexDirection: 'row', gap: 8, flexShrink: 1, flexWrap: 'wrap' },
  selectActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  selectActionText: { fontSize: 13, color: '#7b2cff', fontWeight: '800' },
  deleteActionText: { color: '#dc2626' },
  selectActionDisabled: { opacity: 0.45 },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  selectAllText: { fontSize: 13, color: '#444', fontWeight: '700' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#c4b5fd',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    borderColor: '#7b2cff',
    backgroundColor: '#7b2cff',
  },
  checkboxMark: { color: '#fff', fontSize: 14, fontWeight: '900', lineHeight: 16 },
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
  rowSelected: {
    borderColor: '#c4b5fd',
    backgroundColor: '#faf5ff',
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
  actionBtnDisabled: { opacity: 0.45 },
  callBtn: { backgroundColor: '#e7f9ee' },
  actionTxt: { fontSize: 15 },
  actionTxtDisabled: { opacity: 0.7 },
});
