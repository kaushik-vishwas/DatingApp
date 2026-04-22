import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import type { ReceiverStackParamList } from '../navigation/ReceiverStackParamList';
import { getErrorMessage, profileApi } from '../services/api';
import type { ReceiverWalletSummaryResponse } from '../types/api';

function formatInr(n: number): string {
  const v = Math.round(n * 100) / 100;
  if (Number.isInteger(v)) return `₹${v}`;
  return `₹${v.toFixed(2)}`;
}

/** Receiver (call earner) home — availability, earnings demo, etc. */
type ReceiverHomeNav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverHome'>;

export default function ReceiverHomeDashboard(): React.JSX.Element {
  const navigation = useNavigation<ReceiverHomeNav>();
  const { signOut, user, refreshUser } = useAuth();
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [available, setAvailable] = useState<boolean>(true);
  const [walletSummary, setWalletSummary] = useState<ReceiverWalletSummaryResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  /** Use stable `user._id` only — `refreshUser()` replaces `user` with a new object each time and would
   *  recreate this callback forever when combined with `useFocusEffect`. */
  const receiverId = user?.role === 'receiver' ? user._id : undefined;

  const loadWalletSummary = useCallback(async () => {
    if (!receiverId) return;
    setSummaryError(null);
    try {
      const { data } = await profileApi.receiverWalletSummary();
      setWalletSummary(data);
    } catch (e) {
      setSummaryError(getErrorMessage(e));
    }
  }, [receiverId]);

  useFocusEffect(
    useCallback(() => {
      if (!receiverId) return;
      void loadWalletSummary();
      void refreshUser();
    }, [receiverId, loadWalletSummary, refreshUser])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshUser(), loadWalletSummary()]);
    setRefreshing(false);
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  if (!user) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.pageTitle}>Dashboard</Text>

      {user ? (
        <>
          <View style={styles.row}>
            <View style={[styles.card, styles.cardWide]}>
              <Text style={styles.sectionTitle}>Availability Status</Text>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor: available
                          ? 'rgba(123,44,255,0.9)'
                          : '#bdbdbd',
                      },
                    ]}
                  />
                  <Text style={styles.toggleText}>
                    {available ? 'Available' : 'Unavailable'}
                  </Text>
                </View>
                <Switch
                  value={available}
                  onValueChange={setAvailable}
                  trackColor={{ false: '#e5e5e5', true: 'rgba(123,44,255,0.35)' }}
                  thumbColor={available ? '#7b2cff' : '#bdbdbd'}
                />
              </View>
            </View>

            {user.isVerified ? (
              <View style={[styles.card, styles.cardNarrow]}>
                <View style={styles.verifiedCardHeader}>
                  <Text style={styles.verifiedHeaderText}>Congratulations!</Text>
                </View>
                <View style={styles.badgeWrap}>
                  <View style={styles.badgeCircle}>
                    <Text style={styles.checkMark}>✓</Text>
                  </View>
                </View>
                <Text style={styles.verifiedTitle}>You are a Verified User now</Text>
                <TouchableOpacity style={styles.purpleBtn} onPress={() => Alert.alert('Success', 'Verified flow (demo)')}>
                  <Text style={styles.purpleBtnText}>View Profile</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Earnings Summary</Text>
            {summaryError ? <Text style={styles.summaryErr}>{summaryError}</Text> : null}

            <View style={[styles.card, styles.earningsMainCard]}>
              <View style={styles.earningsMainTop}>
                <View style={styles.earningsIcon} />
                <Text style={styles.earningsSubtitle}>Total wallet</Text>
              </View>
              <Text style={styles.earningsAmount}>
                {walletSummary ? formatInr(walletSummary.walletBalance) : '…'}
              </Text>
              <Text style={styles.earningsPeriod}>
                Includes paid chat credits and other earnings. Pull to refresh after chatting.
              </Text>
            </View>

            <View style={styles.smallEarningsRow}>
              <View style={styles.smallEarningsCard}>
                <Text style={styles.smallEarningsLabel}>Today</Text>
                <Text style={styles.smallEarningsText}>
                  {walletSummary ? formatInr(walletSummary.chatToday) : '…'}
                </Text>
              </View>
              <View style={styles.smallEarningsCard}>
                <Text style={styles.smallEarningsLabel}>This month</Text>
                <Text style={styles.smallEarningsText}>
                  {walletSummary ? formatInr(walletSummary.chatThisMonth) : '…'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent activity</Text>
              <TouchableOpacity onPress={() => Alert.alert('Activity', 'Shows paid chat messages.')}>
                <Text style={styles.viewAll}>View all</Text>
              </TouchableOpacity>
            </View>

            {walletSummary && walletSummary.recent.length === 0 ? (
              <Text style={styles.emptyRecent}>No paid chat messages yet.</Text>
            ) : null}
            {(walletSummary?.recent ?? []).map((row) => (
              <CallRow
                key={row.id}
                title={row.title}
                subtitle={row.subtitle}
                amount={formatInr(row.amountInr)}
              />
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.quickActionsRow}>
              <QuickAction label="Messages" onPress={() => navigation.navigate('ReceiverChats')} />
              <QuickAction label="View Profile" onPress={() => Alert.alert('Demo', 'View Profile')} />
              <QuickAction label="Withdraw Earnings" onPress={() => Alert.alert('Demo', 'Withdraw')} />
              <QuickAction label="View Call History" onPress={() => Alert.alert('Demo', 'Call History')} />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Leader Board</Text>
            </View>
            <View style={styles.leaderBoardCard}>
              <Text style={styles.leaderMinutes}>1000 Minutes</Text>
            </View>
            <View style={styles.leaderBoardCardPurple}>
              <Text style={styles.leaderMinutesPurple}>5000 Minutes</Text>
            </View>
          </View>
        </>
      ) : (
        <Text style={styles.muted}>Could not load profile.</Text>
      )}

      <TouchableOpacity style={styles.logout} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 48,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111',
    marginBottom: 12,
    textAlign: 'center',
  },
  section: { marginTop: 14 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111',
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  viewAll: {
    color: '#7b2cff',
    fontSize: 12,
    fontWeight: '800',
  },
  row: { flexDirection: 'row', gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
  },
  cardWide: { flex: 1 },
  cardNarrow: { width: 150 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#bdbdbd',
  },
  toggleText: { fontSize: 12, fontWeight: '800', color: '#111' },
  verifiedCardHeader: {
    alignItems: 'center',
    marginBottom: 8,
  },
  verifiedHeaderText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#111',
  },
  badgeWrap: { alignItems: 'center', marginBottom: 8 },
  badgeCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(123,44,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(123,44,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: '#7b2cff',
    fontSize: 28,
    fontWeight: '900',
  },
  verifiedTitle: {
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '800',
    color: '#333',
    marginBottom: 10,
    lineHeight: 14,
  },
  purpleBtn: {
    backgroundColor: '#7b2cff',
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  purpleBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  earningsMainCard: {
    backgroundColor: 'rgba(123,44,255,0.10)',
    borderColor: 'rgba(123,44,255,0.18)',
  },
  earningsMainTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  earningsIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(123,44,255,0.14)',
  },
  earningsSubtitle: { fontSize: 11, fontWeight: '900', color: '#7b2cff' },
  earningsAmount: { fontSize: 22, fontWeight: '900', color: '#e6007a', marginTop: 2 },
  earningsPeriod: { fontSize: 11, fontWeight: '700', color: '#666', marginTop: 4 },
  smallEarningsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 10 },
  smallEarningsCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(123,44,255,0.15)',
  },
  smallEarningsLabel: { fontSize: 10, fontWeight: '800', color: '#666', marginBottom: 4 },
  smallEarningsText: { color: '#7b2cff', fontSize: 18, fontWeight: '900' },
  summaryErr: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyRecent: { color: '#666', fontSize: 13, paddingVertical: 8, textAlign: 'center' },
  quickActionsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  leaderBoardCard: {
    backgroundColor: '#7b2cff',
    borderRadius: 12,
    padding: 14,
  },
  leaderBoardCardPurple: {
    backgroundColor: 'rgba(123,44,255,0.16)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(123,44,255,0.24)',
    marginTop: 12,
  },
  leaderMinutes: { color: '#fff', fontWeight: '900', fontSize: 14, textAlign: 'center' },
  leaderMinutesPurple: { color: '#5b21b6', fontWeight: '900', fontSize: 14, textAlign: 'center' },
  muted: { color: '#888', textAlign: 'center' },
  logout: {
    marginTop: 32,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e91e8c',
  },
  logoutText: { color: '#e91e8c', fontSize: 16, fontWeight: '600' },
});

function CallRow({ title, subtitle, amount }: { title: string; subtitle: string; amount: string }) {
  return (
    <View style={callRowStyles.row}>
      <View style={callRowStyles.icon} />
      <View style={{ flex: 1 }}>
        <Text style={callRowStyles.title}>{title}</Text>
        <Text style={callRowStyles.subtitle}>{subtitle}</Text>
      </View>
      <Text style={callRowStyles.amount}>{amount}</Text>
    </View>
  );
}

function QuickAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={quickActionStyles.btn} onPress={onPress}>
      <View style={quickActionStyles.icon} />
      <Text style={quickActionStyles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const callRowStyles = StyleSheet.create({
  row: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(123,44,255,0.15)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(123,44,255,0.12)',
    marginRight: 10,
  },
  title: { fontSize: 12, fontWeight: '900', color: '#111' },
  subtitle: { fontSize: 11, color: '#666', fontWeight: '700', marginTop: 4 },
  amount: { fontSize: 12, color: '#7b2cff', fontWeight: '900' },
});

const quickActionStyles = StyleSheet.create({
  btn: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(123,44,255,0.15)',
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(123,44,255,0.12)',
    marginBottom: 8,
  },
  text: { fontSize: 11, fontWeight: '900', color: '#111', textAlign: 'center' },
});
