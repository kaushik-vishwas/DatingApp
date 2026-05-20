import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useReceiverNotificationData } from '../../context/ReceiverNotificationDataContext';
import { useReceiverTabBarBottomInset } from '../../utils/receiverTabBarInset';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import type { ReceiverNotificationKind, ReceiverNotificationRow } from '../../types/receiverNotification';

type Nav = NativeStackNavigationProp<ReceiverStackParamList>;

type Props = {
  types: ReceiverNotificationKind[];
  emptyLabel?: string;
  showEarningActions?: boolean;
  headerExtra?: React.ReactNode;
};

export default function ReceiverNotificationActivityList({
  types,
  emptyLabel = 'Nothing here yet.',
  showEarningActions = false,
  headerExtra,
}: Props): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const scrollBottomInset = useReceiverTabBarBottomInset();
  const { loading, error, reload, rowsForTypes } = useReceiverNotificationData();
  const filtered = rowsForTypes(types);

  const openChat = (row: ReceiverNotificationRow) => {
    if (!row.peerId || !row.peerName) return;
    navigation.navigate('ReceiverChat', {
      userId: row.peerId,
      userName: row.peerName,
      userImage: row.peerImage ?? null,
    });
  };

  const onOpenRow = (row: ReceiverNotificationRow) => {
    if (row.type === 'withdrawal') {
      navigation.navigate('WithdrawEarnings');
      return;
    }
    if (row.type === 'earning') {
      navigation.navigate('ReceiverEarningsBreakdown');
      return;
    }
    openChat(row);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: scrollBottomInset }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {headerExtra}
      {showEarningActions ? (
        <View style={styles.earningActions}>
          <TouchableOpacity
            style={styles.earningBtn}
            onPress={() => navigation.navigate('ReceiverEarningsBreakdown')}
          >
            <Text style={styles.earningBtnText}>Open Earnings Breakdown</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.earningBtnOutline}
            onPress={() => navigation.navigate('ReceiverEarningsAnalytics')}
          >
            <Text style={styles.earningBtnOutlineText}>Open Analytics</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {loading ? (
        <ActivityIndicator size="large" color="#7b2cff" style={styles.loader} />
      ) : error ? (
        <View style={styles.errorBlock}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void reload()} activeOpacity={0.85}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <Text style={styles.empty}>{emptyLabel}</Text>
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
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16 },
  loader: { marginTop: 24 },
  errorBlock: { marginTop: 16, alignItems: 'center', gap: 10 },
  retryBtn: {
    backgroundColor: '#7b2cff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  error: { color: '#b91c1c', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  empty: { color: '#666', fontSize: 13, marginTop: 12, textAlign: 'center' },
  row: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ececec',
    padding: 10,
    marginBottom: 8,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowTitle: { color: '#111', fontSize: 13, fontWeight: '800', flex: 1 },
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
  earningActions: { marginBottom: 12, gap: 8 },
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
