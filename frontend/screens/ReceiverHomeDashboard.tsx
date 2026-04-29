import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { useChatInbox } from '../context/ChatInboxContext';
import type { ReceiverStackParamList } from '../navigation/ReceiverStackParamList';
import { getErrorMessage, profileApi } from '../services/api';
import type { ReceiverCallInsightsResponse, ReceiverWalletSummaryResponse } from '../types/api';
import { receiverCardMetrics } from '../utils/discoverDisplay';

function formatInr(n: number): string {
  const v = Math.round(n * 100) / 100;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Receiver (call earner) home — availability, earnings demo, etc. */
type ReceiverHomeNav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverHome'>;

export default function ReceiverHomeDashboard(): React.JSX.Element {
  const navigation = useNavigation<ReceiverHomeNav>();
  const { signOut, user, refreshUser } = useAuth();
  const { totalUnread, refreshUnreadFromServer } = useChatInbox();
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [available, setAvailable] = useState<boolean>(Boolean(user?.isAvailable ?? true));
  const [walletSummary, setWalletSummary] = useState<ReceiverWalletSummaryResponse | null>(null);
  const [callInsights, setCallInsights] = useState<ReceiverCallInsightsResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  /** Use stable `user._id` only — `refreshUser()` replaces `user` with a new object each time and would
   *  recreate this callback forever when combined with `useFocusEffect`. */
  const receiverId = user?.role === 'receiver' ? user._id : undefined;
  const previewMetrics = user?.role === 'receiver' ? receiverCardMetrics(user._id) : null;

  const availabilityFromServer = user?.role === 'receiver' ? Boolean(user.isAvailable ?? true) : true;

  React.useEffect(() => {
    setAvailable(availabilityFromServer);
  }, [availabilityFromServer]);

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

  const loadCallInsights = useCallback(async () => {
    if (!receiverId) return;
    try {
      const { data } = await profileApi.receiverCallInsights('all');
      setCallInsights(data);
    } catch (e) {
      setSummaryError((prev) => prev ?? getErrorMessage(e));
    }
  }, [receiverId]);

  useFocusEffect(
    useCallback(() => {
      if (!receiverId) return;
      void loadWalletSummary();
      void loadCallInsights();
      void refreshUser();
      void refreshUnreadFromServer();
    }, [receiverId, loadWalletSummary, loadCallInsights, refreshUser])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshUser(), loadWalletSummary(), loadCallInsights()]);
    setRefreshing(false);
  };

  const onToggleAvailability = async (next: boolean) => {
    const prev = available;
    setAvailable(next);
    try {
      await profileApi.updateReceiverProfile({ isAvailable: next });
      await refreshUser();
    } catch (e) {
      setAvailable(prev);
      Alert.alert('Update failed', getErrorMessage(e));
    }
  };

  const onMessageCaller = (callerId: string, callerName: string) => {
    navigation.navigate('ReceiverChat', { userId: callerId, userName: callerName, userImage: null });
  };

  if (!user) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>Dashboard</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('ReceiverNotifications')}
          >
            <Text style={styles.iconText}>🔔</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerProfileBtn}
            onPress={() => navigation.navigate('ReceiverSettings')}
            activeOpacity={0.85}
          >
            {user?.profileImage ? (
              <Image source={{ uri: user.profileImage }} style={styles.headerProfileImg} />
            ) : (
              <View style={styles.headerProfilePh}>
                <Text style={styles.headerProfileTxt}>{user?.name?.charAt(0) ?? '?'}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {user ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Public Preview</Text>
            <View style={styles.publicCard}>
              <View style={styles.publicCardTop}>
                <View style={styles.publicAvatarCol}>
                  <View
                    style={[
                      styles.publicAvatarRing,
                      {
                        borderColor: !Boolean(user.isOnline)
                          ? '#dc2626'
                          : available
                            ? '#22c55e'
                            : '#f59e0b',
                      },
                    ]}
                  >
                    {user.profileImage ? (
                      <Image source={{ uri: user.profileImage }} style={styles.publicAvatar} />
                    ) : (
                      <View style={[styles.publicAvatar, styles.publicAvatarPlaceholder]}>
                        <Text style={styles.publicAvatarGlyph}>👤</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.publicRatingRow}>
                    <Text style={styles.publicStar}>★</Text>
                    <Text style={styles.publicRatingText}>
                      {previewMetrics?.rating ?? 4.0} ({previewMetrics?.reviews ?? 0})
                    </Text>
                  </View>
                </View>
                <View style={styles.publicMain}>
                  <Text style={styles.publicName}>
                    {user.name}
                    {user.age != null ? `, ${user.age} Y` : ''}
                  </Text>
                  <Text style={styles.publicInterests} numberOfLines={2}>
                    {(user.interests ?? []).length > 0
                      ? user.interests.slice(0, 4).join(' | ')
                      : '—'}
                  </Text>
                  <Text style={styles.publicState}>{user.state?.trim() || '—'}</Text>
                </View>
                <View style={styles.publicLangCol}>
                  {(user.languages ?? []).slice(0, 3).map((lang) => (
                    <View key={lang} style={styles.publicMiniLang}>
                      <Text style={styles.publicMiniLangText}>{lang}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={styles.publicCardBottom}>
                <Text
                  style={[
                    styles.publicStatus,
                    {
                      color: !Boolean(user.isOnline)
                        ? '#dc2626'
                        : available
                          ? '#22c55e'
                          : '#f59e0b',
                    },
                  ]}
                >
                  {!Boolean(user.isOnline) ? 'Offline' : available ? 'Available' : 'Busy'}
                </Text>
                <Text style={styles.publicRate}>
                  {typeof user.audioCallRate === 'number' && Number.isFinite(user.audioCallRate)
                    ? `₹${user.audioCallRate} / Min`
                    : 'Rate TBD'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.availabilityCard}>
            <View style={styles.availabilityLeft}>
              <View style={styles.availabilityIcon} />
              <View>
                <Text style={styles.availabilityTitle}>Availability Status</Text>
                <Text style={styles.availabilitySub}>
                  {available && Boolean(user.isOnline)
                    ? "You're online"
                    : available
                      ? 'Going online...'
                      : 'You are Offline'}
                </Text>
              </View>
            </View>
            <Switch
              value={available}
              onValueChange={(next) => void onToggleAvailability(next)}
              trackColor={{ false: '#e5e5e5', true: 'rgba(123,44,255,0.35)' }}
              thumbColor={available ? '#7b2cff' : '#bdbdbd'}
            />
          </View>

          <TouchableOpacity
            style={styles.goOnlineCard}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('ReceiverQueue')}
          >
            <View style={styles.goOnlineLeft}>
              <View style={styles.goOnlinePowerWrap}>
                <Text style={styles.goOnlinePowerIcon}>⏻</Text>
              </View>
              <View>
                <Text style={styles.goOnlineTitle}>Go Online</Text>
                {/* <Text style={styles.goOnlineSub}>Open waiting queue and receive callers instantly</Text> */}
              </View>
            </View>
            <Text style={styles.goOnlineArrow}>→</Text>
          </TouchableOpacity>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Earnings Summary</Text>
            {summaryError ? <Text style={styles.summaryErr}>{summaryError}</Text> : null}

            <View style={styles.earningsMainCard}>
              <View style={styles.earningsHeader}>
                <Text style={styles.earningsSubtitle}>Total Earnings</Text>
                <View style={styles.earningsTrend} />
              </View>
              <Text style={styles.earningsAmount}>
                {walletSummary ? formatInr(walletSummary.walletBalance) : '…'}
              </Text>
              <Text style={styles.earningsPeriod}>
                Lifetime earnings from all calls
              </Text>
            </View>

            <View style={styles.smallEarningsRow}>
              <View style={styles.smallEarningsCard}>
                <Text style={styles.smallEarningsLabel}>Today</Text>
                <Text style={styles.smallEarningsText}>
                  {walletSummary ? formatInr(walletSummary.chatToday) : '₹0'}
                </Text>
              </View>
              <View style={styles.smallEarningsCard}>
                <Text style={styles.smallEarningsLabel}>This Week</Text>
                <Text style={[styles.smallEarningsText, { color: '#2563eb' }]}>
                  {walletSummary ? formatInr(walletSummary.chatThisMonth) : '₹0'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent Calls</Text>
              <TouchableOpacity onPress={() => navigation.navigate('ReceiverCallHistory')}>
                <Text style={styles.viewAll}>View all</Text>
              </TouchableOpacity>
            </View>

            {callInsights && callInsights.recentCalls.length === 0 ? (
              <Text style={styles.emptyRecent}>No voice calls yet.</Text>
            ) : null}
            {(callInsights?.recentCalls ?? []).slice(0, 4).map((row) => (
              <CallRow
                key={row.id}
                callerId={row.callerId}
                title={row.callerName}
                subtitle={`${Math.max(1, Math.round(row.durationSec / 60))} min`}
                onMessage={onMessageCaller}
              />
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.quickActionsCol}>
              <QuickAction
                label="View Profile"
                sublabel="Click to see your Profile"
                onPress={() => navigation.navigate('ReceiverProfilePreview')}
              />
              <QuickAction
                label="Withdraw Earnings"
                sublabel="Transfer money to your bank account"
                onPress={() => navigation.navigate('WithdrawEarnings')}
              />
              <QuickAction
                label="View Call History"
                sublabel="See all your past calls and earnings"
                onPress={() => navigation.navigate('ReceiverCallHistory')}
              />
              <QuickAction
                label="Messages"
                sublabel="Open your chats"
                badgeCount={totalUnread}
                onPress={() => navigation.navigate('ReceiverChats')}
              />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Leader Board</Text>
            </View>
            <View style={styles.leaderBoardCard}>
              <Text style={styles.leaderMinutesBig}>
                {callInsights ? Math.round(callInsights.leaderboard.totalMinutes) : 0}
                <Text style={styles.leaderMinutesUnit}> Minutes</Text>
              </Text>
            </View>
            <View style={styles.leaderBoardCardPurple}>
              <Text style={styles.leaderMinutesBig}>
                {callInsights ? Math.round(callInsights.leaderboard.thisMonthMinutes) : 0}
                <Text style={styles.leaderMinutesUnit}> Minutes</Text>
              </Text>
              <View style={styles.progressTrack}>
                <View style={styles.progressFill} />
              </View>
            </View>
          </View>
        </>
      ) : (
        <Text style={styles.muted}>Could not load profile.</Text>
      )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8f8f8' },
  scroll: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 48,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111',
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerIcons: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ececec',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 16 },
  headerProfileBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ececec',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerProfileImg: { width: '100%', height: '100%' },
  headerProfilePh: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1e9ff',
  },
  headerProfileTxt: { fontSize: 13, fontWeight: '900', color: '#7b2cff' },
  availabilityCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  availabilityLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  availabilityIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(123,44,255,0.12)',
  },
  availabilityTitle: { fontSize: 14, color: '#111', fontWeight: '800' },
  availabilitySub: { fontSize: 12, color: '#16a34a', fontWeight: '700', marginTop: 2 },
  goOnlineCard: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 18,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    paddingHorizontal: 15,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goOnlineLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goOnlinePowerWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#312e81',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goOnlinePowerIcon: { color: '#fff', fontSize: 18, fontWeight: '900' },
  goOnlineTitle: { fontSize: 14, color: '#0f172a', fontWeight: '800' },
  goOnlineSub: { fontSize: 12, color: '#4338ca', fontWeight: '600', marginTop: 2 },
  goOnlineArrow: { fontSize: 20, color: '#4338ca', fontWeight: '900' },
  section: { marginTop: 16 },
  publicCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ececec',
  },
  publicCardTop: { flexDirection: 'row', gap: 12 },
  publicAvatarCol: { width: 76, alignItems: 'center', paddingTop: 2 },
  publicAvatarRing: {
    borderWidth: 3,
    borderRadius: 35,
    width: 70,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publicAvatar: { width: 64, height: 64, borderRadius: 32 },
  publicAvatarPlaceholder: { backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' },
  publicAvatarGlyph: { fontSize: 28 },
  publicRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  publicStar: { color: '#fbbf24', fontSize: 14 },
  publicRatingText: { fontSize: 12, fontWeight: '700', color: '#444' },
  publicMain: { flex: 1, minWidth: 0 },
  publicName: { fontSize: 15, fontWeight: '900', color: '#111' },
  publicInterests: { fontSize: 11, color: '#888', marginTop: 6, lineHeight: 16 },
  publicState: { fontSize: 12, color: '#666', marginTop: 6 },
  publicLangCol: { alignItems: 'flex-end', gap: 4 },
  publicMiniLang: {
    backgroundColor: 'rgba(123,44,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  publicMiniLangText: { fontSize: 10, fontWeight: '800', color: '#7b2cff' },
  publicCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  publicStatus: { fontSize: 12, fontWeight: '800' },
  publicRate: {
    backgroundColor: '#22c55e',
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 18,
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
  earningsMainCard: {
    backgroundColor: '#e97cdd',
    borderColor: '#dd67cf',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  earningsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  earningsTrend: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  earningsSubtitle: { fontSize: 12, fontWeight: '700', color: '#492245' },
  earningsAmount: { fontSize: 36, fontWeight: '900', color: '#111', marginTop: 4 },
  earningsPeriod: { fontSize: 12, fontWeight: '600', color: '#5f3b5d', marginTop: 2 },
  smallEarningsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 10 },
  smallEarningsCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ececec',
  },
  smallEarningsLabel: { fontSize: 12, fontWeight: '700', color: '#666', marginBottom: 4 },
  smallEarningsText: { color: '#16a34a', fontSize: 36, fontWeight: '900' },
  summaryErr: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyRecent: { color: '#666', fontSize: 13, paddingVertical: 8, textAlign: 'center' },
  quickActionsCol: { gap: 10 },
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
  leaderMinutesBig: { color: '#fff', fontWeight: '900', fontSize: 36 },
  leaderMinutesUnit: { fontSize: 15, fontWeight: '700' },
  progressTrack: {
    marginTop: 10,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.55)',
    overflow: 'hidden',
  },
  progressFill: { width: '58%', height: 7, backgroundColor: '#f4b900' },
  muted: { color: '#888', textAlign: 'center' },
});

function CallRow({
  callerId,
  title,
  subtitle,
  onMessage,
}: {
  callerId: string;
  title: string;
  subtitle: string;
  onMessage: (callerId: string, callerName: string) => void;
}) {
  return (
    <View style={callRowStyles.row}>
      <View style={callRowStyles.icon} />
      <View style={{ flex: 1 }}>
        <Text style={callRowStyles.title}>{title}</Text>
        <Text style={callRowStyles.subtitle}>{subtitle}</Text>
      </View>
      <View style={callRowStyles.actions}>
        <TouchableOpacity
          style={callRowStyles.actionBtn}
          onPress={() => onMessage(callerId, title)}
          activeOpacity={0.85}
        >
          <Text style={callRowStyles.actionTxt}>💬</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function QuickAction({
  label,
  sublabel,
  onPress,
  badgeCount = 0,
}: {
  label: string;
  sublabel: string;
  onPress: () => void;
  badgeCount?: number;
}) {
  return (
    <TouchableOpacity style={quickActionStyles.btn} onPress={onPress}>
      <View style={quickActionStyles.iconBox}>
        <View style={quickActionStyles.icon} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={quickActionStyles.text}>{label}</Text>
        <Text style={quickActionStyles.sub}>{sublabel}</Text>
      </View>
      {badgeCount > 0 ? (
        <View style={quickActionStyles.badge}>
          <Text style={quickActionStyles.badgeText}>
            {badgeCount > 99 ? '99+' : String(badgeCount)}
          </Text>
        </View>
      ) : null}
      <Text style={quickActionStyles.chev}>{'>'}</Text>
    </TouchableOpacity>
  );
}

const callRowStyles = StyleSheet.create({
  row: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(123,44,255,0.12)',
    marginRight: 10,
  },
  title: { fontSize: 12, fontWeight: '900', color: '#111' },
  subtitle: { fontSize: 11, color: '#666', fontWeight: '700', marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTxt: { fontSize: 14 },
});

const quickActionStyles = StyleSheet.create({
  btn: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f5ecff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#7b2cff',
  },
  text: { fontSize: 15, fontWeight: '800', color: '#111' },
  sub: { fontSize: 11, color: '#777', marginTop: 2, fontWeight: '600' },
  chev: { fontSize: 16, color: '#aaa', fontWeight: '700' },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
});
