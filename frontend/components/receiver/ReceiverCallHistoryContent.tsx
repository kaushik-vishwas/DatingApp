import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { getErrorMessage, profileApi } from '../../services/api';
import type { ReceiverCallInsightsResponse } from '../../types/api';
import { formatCallDurationCompact } from '../../utils/callDurationDisplay';
import { SCREEN_FETCH_TIMEOUT_MS, withTimeout } from '../../utils/withTimeout';

type RangeTab = 'all' | 'week' | 'month';
const HISTORY_REFRESH_THROTTLE_MS = 12_000;

type HistorySelectItem = {
  key: string;
  sessionIds: string[];
};

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
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
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

  const selectableItems = useMemo((): HistorySelectItem[] => {
    if (!data || !callsOnly) return [];
    const items: HistorySelectItem[] = [];
    for (const group of data.missedCallGroups ?? []) {
      const sessionIds = group.sessionIds?.filter(Boolean) ?? [];
      if (sessionIds.length === 0) continue;
      items.push({ key: `missed-${group.callerId}`, sessionIds });
    }
    for (const group of data.incompleteCallGroups ?? []) {
      const sessionIds = group.sessionIds?.filter(Boolean) ?? [];
      if (sessionIds.length === 0) continue;
      items.push({ key: `incomplete-${group.callerId}`, sessionIds });
    }
    for (const row of data.recentCalls) {
      if (!row.id) continue;
      items.push({ key: row.id, sessionIds: [row.id] });
    }
    return items;
  }, [callsOnly, data]);

  const itemByKey = useMemo(
    () => new Map(selectableItems.map((item) => [item.key, item])),
    [selectableItems]
  );

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedKeys(new Set());
  }, []);

  const toggleSelected = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const allVisibleSelected =
    selectableItems.length > 0 && selectableItems.every((item) => selectedKeys.has(item.key));
  const selectedCount = selectedKeys.size;

  const onToggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedKeys(new Set());
      return;
    }
    setSelectedKeys(new Set(selectableItems.map((item) => item.key)));
  };

  const onDeleteSelected = () => {
    if (selectedCount === 0 || deleting) return;
    const ids = [
      ...new Set(
        [...selectedKeys].flatMap((key) => itemByKey.get(key)?.sessionIds ?? [])
      ),
    ];
    if (ids.length === 0) return;

    Alert.alert(
      'Delete history',
      selectedCount === 1
        ? 'Remove this entry from History?'
        : `Remove ${selectedCount} entries from History?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            void (async () => {
              try {
                await profileApi.deleteReceiverCallHistory(ids);
                setData((prev) => {
                  if (!prev) return prev;
                  const idSet = new Set(ids);
                  return {
                    ...prev,
                    missedCallGroups: (prev.missedCallGroups ?? []).filter(
                      (group) => !selectedKeys.has(`missed-${group.callerId}`)
                    ),
                    incompleteCallGroups: (prev.incompleteCallGroups ?? []).filter(
                      (group) => !selectedKeys.has(`incomplete-${group.callerId}`)
                    ),
                    recentCalls: prev.recentCalls.filter((row) => !idSet.has(row.id)),
                  };
                });
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

  const renderSelectableCard = (
    itemKey: string,
    cardStyle: StyleProp<ViewStyle>,
    content: React.JSX.Element
  ): React.JSX.Element => {
    if (!callsOnly || !selectMode) {
      return <View style={cardStyle}>{content}</View>;
    }
    const isSelected = selectedKeys.has(itemKey);
    return (
      <TouchableOpacity
        style={[cardStyle, isSelected && styles.rowSelected]}
        onPress={() => toggleSelected(itemKey)}
        activeOpacity={0.85}
      >
        <View style={styles.selectRow}>
          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
            {isSelected ? <Text style={styles.checkboxMark}>✓</Text> : null}
          </View>
          <View style={styles.selectRowBody}>{content}</View>
        </View>
      </TouchableOpacity>
    );
  };

  const showSelectActions = callsOnly && !loading && !error && selectableItems.length > 0;

  const filtersBar = (
    <>
      <View style={[styles.content, styles.tabsRow]}>
        <View style={styles.tabs}>
          {(['all', 'week', 'month'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
              onPress={() => {
                if (selectMode) exitSelectMode();
                setTab(t);
              }}
              disabled={selectMode}
              activeOpacity={0.85}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'all' ? 'All' : t === 'week' ? 'This Week' : 'This Month'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {showSelectActions ? (
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

      {selectMode && selectableItems.length > 0 ? (
        <TouchableOpacity
          style={[styles.content, styles.selectAllRow]}
          onPress={onToggleSelectAll}
          activeOpacity={0.85}
        >
          <View style={[styles.checkbox, allVisibleSelected && styles.checkboxChecked]}>
            {allVisibleSelected ? <Text style={styles.checkboxMark}>✓</Text> : null}
          </View>
          <Text style={styles.selectAllText}>{allVisibleSelected ? 'Deselect all' : 'Select all'}</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );

  const listBody = (
    <>
      {loading ? (
        <ActivityIndicator size="large" color="#7b2cff" style={styles.loader} />
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
              <Text style={[styles.section, callsOnly && styles.sectionTight]}>Missed calls</Text>
              {data.missedCallGroups.map((group) =>
                renderSelectableCard(
                  `missed-${group.callerId}`,
                  [styles.rowCard, styles.missedCard],
                  <>
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
                  </>
                )
              )}
            </>
          ) : null}

          {(data.incompleteCallGroups?.length ?? 0) > 0 ? (
            <>
              <Text
                style={[
                  styles.section,
                  callsOnly &&
                    (data.missedCallGroups?.length ?? 0) === 0 &&
                    styles.sectionTight,
                ]}
              >
                Incomplete calls
              </Text>
              {data.incompleteCallGroups.map((group) =>
                renderSelectableCard(
                  `incomplete-${group.callerId}`,
                  [styles.rowCard, styles.missedCard],
                  <>
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
                  </>
                )
              )}
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
            data.recentCalls.map((row) =>
              renderSelectableCard(
                row.id,
                styles.rowCard,
                <>
                  <Text style={styles.name}>{row.callerName}</Text>
                  <Text style={styles.meta}>{new Date(row.startedAt).toLocaleString()}</Text>
                  <Text style={styles.meta}>
                    Talk time: {formatCallDurationCompact(row.durationSec)}
                    {row.earningInr > 0 ? ` • ₹${Math.round(row.earningInr)} earned` : ''}
                  </Text>
                  {row.rating != null ? (
                    <Text style={styles.meta}>Rating: {row.rating}</Text>
                  ) : null}
                </>
              )
            )
          )}
        </>
      ) : null}
    </>
  );

  if (callsOnly) {
    return (
      <View style={styles.screen}>
        {filtersBar}
        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={[styles.content, { paddingBottom: scrollPaddingBottom }]}
          showsVerticalScrollIndicator={false}
        >
          {listBody}
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: scrollPaddingBottom }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.tabsRow}>
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
      </View>
      {listBody}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listScroll: { flex: 1 },
  content: { paddingHorizontal: 16 },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, flexShrink: 1 },
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
  selectActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  selectActionText: { fontSize: 13, color: '#7b2cff', fontWeight: '800' },
  deleteActionText: { color: '#dc2626' },
  selectActionDisabled: { opacity: 0.45 },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  selectAllText: { fontSize: 13, color: '#444', fontWeight: '700' },
  loader: { marginTop: 12 },
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
  selectRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  selectRowBody: { flex: 1 },
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
  sectionTight: { marginTop: 4 },
  empty: { fontSize: 12, color: '#666', marginTop: 8 },
  rowCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ececec',
    padding: 10,
    marginBottom: 8,
  },
  rowSelected: {
    borderColor: '#c4b5fd',
    backgroundColor: '#faf5ff',
  },
  missedCard: {
    borderColor: '#fcd34d',
    backgroundColor: '#fffbeb',
  },
  name: { fontSize: 13, color: '#111', fontWeight: '800' },
  meta: { marginTop: 3, fontSize: 11, color: '#666', fontWeight: '600' },
});
