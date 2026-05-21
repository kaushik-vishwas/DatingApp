import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
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
import {
  countUnreadByTimestamp,
  getNotificationLastSeenAt,
  markNotificationsSeenNow,
} from '../services/notificationUnread';
import { chatApi, getErrorMessage, profileApi } from '../services/api';
import type { ReceiverCallInsightsResponse, ReceiverWalletSummaryResponse } from '../types/api';
import { formatCallDurationCompact, leaderboardMinutesFromSeconds } from '../utils/callDurationDisplay';
import { type ReceiverPresenceInfo } from '../utils/receiverStatus';
import { resolveProfileImageSource } from '../utils/avatarSource';
import SelectoLogo from '../assets/SelectoLogo.png';
import { useReceiverTabBarBottomInset } from '../utils/receiverTabBarInset';

const PURPLE = '#7b2cff';
const PINK = '#ff72d2';

function formatInr(n: number): string {
  const v = Math.round(n * 100) / 100;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function getReceiverPublicPresence(isOnline: boolean, isAvailable: boolean): ReceiverPresenceInfo {
  // Offline when logged out or switch is OFF (yellowish).
  if (!isOnline || !isAvailable) {
    return {
      status: 'offline',
      label: 'Offline',
      color: '#f59e0b',
      canCall: false,
      canMessage: true,
    };
  }

  // Available + online (green).
  return {
    status: 'available',
    label: 'Available',
    color: '#22c55e',
    canCall: true,
    canMessage: true,
  };
}

/** Receiver (call earner) home — availability, earnings demo, etc. */
type ReceiverHomeNav = NativeStackNavigationProp<ReceiverStackParamList>;

export default function ReceiverHomeDashboard(): React.JSX.Element {
  const navigation = useNavigation<ReceiverHomeNav>();
  const { signOut, user, refreshUser } = useAuth();
  const { totalUnread, refreshUnreadFromServer } = useChatInbox();
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [available, setAvailable] = useState<boolean>(Boolean(user?.isAvailable ?? false));
  const [walletSummary, setWalletSummary] = useState<ReceiverWalletSummaryResponse | null>(null);
  const [callInsights, setCallInsights] = useState<ReceiverCallInsightsResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [notificationUnread, setNotificationUnread] = useState(0);
  const scrollBottomInset = useReceiverTabBarBottomInset();

  const receiverId = user?.role === 'receiver' ? user._id : undefined;
  const availabilityFromServer =
    user?.role === 'receiver' ? Boolean(user.isAvailable ?? false) : false;

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

  const loadReceiverNotificationUnread = useCallback(async () => {
    if (!receiverId) return;
    try {
      const [lastSeenAt, { data: conversations }, { data: calls }, { data: withdrawals }, { data: online }] =
        await Promise.all([
          getNotificationLastSeenAt('receiver'),
          // Mirror same data sources as ReceiverNotificationsScreen for consistent count.
          chatApi.conversations(),
          profileApi.receiverCallInsights('all'),
          profileApi.receiverWithdrawalOverview(),
          profileApi.receiverCallerOnlineNotifications(),
        ]);
      const callerOnline = online.notifications;
      const rows = [
        ...conversations.conversations.map((c) => ({ at: c.lastAt })),
        ...calls.recentCalls.map((c) => ({ at: c.startedAt })),
        ...calls.missedCallGroups.map((g) => ({ at: g.lastAt })),
        ...calls.incompleteCallGroups.map((g) => ({ at: g.lastAt })),
        ...callerOnline.map((n) => ({ at: n.at })),
        ...withdrawals.recent.map((w) => ({ at: w.createdAt })),
      ];
      setNotificationUnread(countUnreadByTimestamp(rows, lastSeenAt));
    } catch {
    }
  }, [receiverId]);

  useFocusEffect(
    useCallback(() => {
      if (!receiverId) return;
      void loadWalletSummary();
      void loadCallInsights();
      void loadReceiverNotificationUnread();
      void refreshUser();
      void refreshUnreadFromServer();
    }, [receiverId, loadWalletSummary, loadCallInsights, loadReceiverNotificationUnread, refreshUser])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshUser(), loadWalletSummary(), loadCallInsights(), loadReceiverNotificationUnread()]);
    setRefreshing(false);
  };

  const onToggleAvailability = async (next: boolean) => {
    const prev = available;
    setAvailable(next);
    try {
      await profileApi.updateReceiverProfile({ isAvailable: next });
      await refreshUser();
      if (next) {
        navigation.navigate('VoiceCall', { receiverAvailabilitySession: true });
      }
    } catch (e) {
      setAvailable(prev);
      Alert.alert('Update failed', getErrorMessage(e));
    }
  };

  const onMessageCaller = (callerId: string, callerName: string, callerImage?: string | null) => {
    navigation.navigate('ReceiverChat', { userId: callerId, userName: callerName, userImage: callerImage ?? null });
  };

  if (!user) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const persistedScoreFromProfile =
    user.role === 'receiver' && typeof user.cumulativeScore === 'number' && Number.isFinite(user.cumulativeScore)
      ? user.cumulativeScore
      : 0;
  const publicPresence = getReceiverPublicPresence(Boolean(user.isOnline), available);
  const trophyScoreRounded =
    callInsights != null
      ? Math.round(callInsights.totalScore)
      : Math.round(persistedScoreFromProfile);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: scrollBottomInset }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.topSection}>
          <View style={styles.topBar}>
            <Image
              source={SelectoLogo}
              style={styles.brandLogo}
              resizeMode="contain"
            />
            <View style={styles.topRight}>
              <TouchableOpacity
                style={styles.scoreCapsule}
                onPress={() => navigation.navigate('WithdrawEarnings')}
                activeOpacity={0.85}
              >
                <View style={styles.scoreContainer}>
                  <Text style={styles.scoreIco}>🏆</Text>
                  <Text style={styles.scoreText}>
                    {trophyScoreRounded.toLocaleString('en-IN')}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.bellButton}
                onPress={() => {
                  void (async () => {
                    await markNotificationsSeenNow('receiver');
                    setNotificationUnread(0);
                    navigation.navigate('ReceiverNotifications');
                  })();
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.bellIcon}>🔔</Text>
                {notificationUnread > 0 ? (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>
                      {notificationUnread > 99 ? '99+' : String(notificationUnread)}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.avatarCapsule}
                onPress={() => navigation.navigate('ReceiverSettings')}
                activeOpacity={0.85}
              >
                {(() => {
                  const meSrc = user?.profileImage ? resolveProfileImageSource(user.profileImage) : null;
                  return meSrc ? (
                    <Image source={meSrc} style={styles.meAvatar} />
                  ) : (
                    <View style={styles.avatarContainer}>
                      <Text style={styles.meAvatarTxt}>{user?.name?.charAt(0) ?? '?'}</Text>
                    </View>
                  );
                })()}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {user ? (
          <>
            <View style={styles.section}>
              <View style={styles.publicCard}>
                <View style={styles.publicCardRow}>
                  <View style={styles.publicLeftColumn}>
                    <View
                      style={[
                        styles.publicAvatarWrapper,
                        {
                          borderColor: publicPresence.color,
                        },
                      ]}
                    >
                      {(() => {
                        const pubSrc = user.profileImage
                          ? resolveProfileImageSource(user.profileImage)
                          : null;
                        return pubSrc ? (
                          <Image source={pubSrc} style={styles.publicAvatar} />
                        ) : (
                          <View style={[styles.publicAvatar, styles.publicAvatarPlaceholder]}>
                            <Text style={styles.publicAvatarGlyph}>👤</Text>
                          </View>
                        );
                      })()}
                      <View
                        style={[
                          styles.publicStatusDot,
                          {
                            backgroundColor: publicPresence.color,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.publicRatingBelow}>
                      <Ionicons name="star" size={10} color="#fbbf24" />
                      <Text style={styles.publicRatingText}>{callInsights?.receiverRatingAvg ?? 0}</Text>
                      <Text style={styles.publicRatingCount}>({callInsights?.receiverRatingCount ?? 0})</Text>
                    </View>
                  </View>
                  <View style={styles.publicInfoSection}>
                    <Text style={styles.publicCardName} numberOfLines={1}>
                      {user.name}
                      {user.age != null ? `, ${user.age}` : ''}
                    </Text>
                    <Text style={styles.publicCardInterests} numberOfLines={1}>
                      {(user.interests ?? []).length > 0
                        ? user.interests.slice(0, 3).join(' • ')
                        : '—'}
                    </Text>
                    <Text style={styles.publicCardLoc} numberOfLines={1}>
                      {user.state?.trim() || '—'}
                    </Text>
                  </View>
                  <View style={styles.publicRightColumn}>
                    <View style={styles.publicRateBtn}>
                      <Text style={styles.publicRateBtnText}>
                        {typeof user.audioCallRate === 'number' && Number.isFinite(user.audioCallRate)
                          ? `₹${user.audioCallRate}/min`
                          : '₹5/min'}
                      </Text>
                    </View>
                    <View style={styles.publicLanguagesRow}>
                      {(user.languages ?? []).slice(0, 2).map((lang) => (
                        <View key={lang} style={styles.publicMiniLang}>
                          <Text style={styles.publicMiniLangText}>{lang.substring(0, 3)}</Text>
                        </View>
                      ))}
                      {(user.languages ?? []).length > 2 ? (
                        <Text style={styles.publicMoreLang}>+{(user.languages ?? []).length - 2}</Text>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.publicStatusPillRight,
                        {
                          backgroundColor: `${publicPresence.color}15`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.publicStatusTextRight,
                          {
                            color: publicPresence.color,
                          },
                        ]}
                      >
                        {publicPresence.label}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.availabilityCard}>
              <View style={styles.availabilityLeft}>
              <Ionicons name="power-outline" size={20} color="#7b2cff" />
                <Text style={styles.availabilityTitle}>Go Online </Text>
              </View>
              <View style={styles.availabilityStatusRow}>
                <Text style={[styles.availabilityStatusText, { color: available ? '#22c55e' : '#f59e0b' }]}>
                  {available ? '- You Are Online' : '- You Are Offline'}
                </Text>
                <Switch
                  value={available}
                  onValueChange={(next) => void onToggleAvailability(next)}
                  trackColor={{ false: '#e5e5e5', true: 'rgba(123,44,255,0.35)' }}
                  thumbColor={available ? PURPLE : '#bdbdbd'}
                />
              </View>
            </View>

            {/* Earning Levels Section - Purple Gradient Card */}
            <View style={styles.infoSection}>
              <Text style={styles.infoSectionTitle}>Earning Levels</Text>
              <LinearGradient
                colors={['#7F00FF', '#A855F7', '#E100FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradientCard}
              >
                <View style={styles.earningLevelList}>
                  <View style={styles.levelRow}>
                    <Text style={styles.levelTime}>9 AM - 9 PM</Text>
                    <Text style={styles.levelRate}>0.5x Score Multiplier</Text>
                  </View>
                  <View style={styles.levelDividerLine} />
                  <View style={styles.levelRow}>
                    <Text style={styles.levelTime}>10 PM - 12 PM</Text>
                    <Text style={styles.levelRate}>3x Score Multiplier</Text>
                  </View>
                  <View style={styles.levelDividerLine} />
                  <View style={styles.levelRow}>
                    <Text style={styles.levelTime}>12 AM - 2 AM</Text>
                    <Text style={styles.levelRate}>10x Score Multiplier</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>

            {/* Guidelines Section - Purple Gradient Card */}
            <View style={styles.infoSection}>
              <Text style={styles.infoSectionTitle}>Instructions</Text>
              <LinearGradient
                colors={['#7F00FF', '#A855F7', '#E100FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradientCard}
              >
                <View style={styles.guidelinesList}>
                  <View style={styles.guidelineRow}>
                    <Ionicons name="time-outline" size={16} color="#fff" style={styles.guideIcon} />
                    <Text style={styles.guidelineText}>Maximum you stay in online minimum 8 hours per day.</Text>
                  </View>
                  <View style={styles.guidelineRow}>
                    <Ionicons name="lock-closed-outline" size={16} color="#fff" style={styles.guideIcon} />
                    <Text style={styles.guidelineText}>Don't share personal information like phone number, personal ID</Text>
                  </View>
                  <View style={styles.guidelineRow}>
                    <Ionicons name="call-outline" size={16} color="#fff" style={styles.guideIcon} />
                    <Text style={styles.guidelineText}>Block the calls if they caller talk badly and rudely.</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Earnings Summary</Text>
              {summaryError ? <Text style={styles.summaryErr}>{summaryError}</Text> : null}

              <LinearGradient
                colors={['#7F00FF', '#A855F7', '#E100FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.earningsMainCard}
              >
                <View style={styles.earningsHeader}>
                  <Text style={styles.earningsSubtitle}>Total Earnings</Text>
                  <View style={styles.earningsIconWrap}>
                    <Ionicons name="card-outline" size={20} color="#fff" />
                  </View>
                </View>
                <Text style={styles.earningsAmount}>
                  {walletSummary
                    ? formatInr(
                      typeof walletSummary.totalEarningsLifetime === 'number'
                        ? walletSummary.totalEarningsLifetime
                        : (typeof walletSummary.callEarningsLifetime === 'number'
                          ? walletSummary.callEarningsLifetime
                          : 0) +
                        (typeof walletSummary.chatEarningsLifetime === 'number'
                          ? walletSummary.chatEarningsLifetime
                          : 0)
                    )
                    : '…'}
                </Text>

              </LinearGradient>

              <View style={styles.smallEarningsRow}>
                <View style={styles.smallEarningsCard}>
                  <Text style={styles.smallEarningsLabel}>Earned today</Text>
                  <Text style={styles.smallEarningsText}>
                    {walletSummary
                      ? formatInr(
                        typeof walletSummary.totalEarningsToday === 'number'
                          ? walletSummary.totalEarningsToday
                          : (typeof walletSummary.callEarningsToday === 'number'
                            ? walletSummary.callEarningsToday
                            : 0) +
                          (typeof walletSummary.chatToday === 'number'
                            ? walletSummary.chatToday
                            : 0)
                      )
                      : '₹0'}
                  </Text>
                </View>
                <View style={styles.smallEarningsCard}>
                  <Text style={styles.smallEarningsLabel}>Earned in 7 days</Text>
                  <Text style={[styles.smallEarningsText, { color: '#2563eb' }]}>
                    {walletSummary
                      ? formatInr(
                        typeof walletSummary.totalEarningsThisWeek === 'number'
                          ? walletSummary.totalEarningsThisWeek
                          : (typeof walletSummary.callEarningsThisWeek === 'number'
                            ? walletSummary.callEarningsThisWeek
                            : 0) +
                          (typeof walletSummary.chatEarningsThisWeek === 'number'
                            ? walletSummary.chatEarningsThisWeek
                            : 0)
                      )
                      : '₹0'}
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
                  subtitle={formatCallDurationCompact(row.durationSec)}
                  callerImage={row.callerImage}
                  onMessage={onMessageCaller}
                />
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Quick Actions</Text>
              <View style={styles.quickActionsCol}>
                <QuickAction
                  label="Withdraw Earnings"
                  sublabel="Transfer money to your bank account"
                  iconName="wallet-outline"
                  onPress={() => navigation.navigate('WithdrawEarnings')}
                />
                <QuickAction
                  label="Messages"
                  sublabel="Open your chats"
                  iconName="chatbubble-outline"
                  badgeCount={totalUnread}
                  onPress={() => navigation.navigate('ReceiverChats')}
                />
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
  safe: { flex: 1, backgroundColor: '#f6f6f7' },
  scroll: {
    flex: 1,
    backgroundColor: '#f6f6f7',
  },
  content: {
    paddingBottom: 16,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  topSection: {
    marginBottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandLogo: {
    width: 140,
    height: 50,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },

  scoreCapsule: {
    borderRadius: 30,
    borderWidth: 1.2,
    borderColor: PINK,
    backgroundColor: 'transparent',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
    backgroundColor: 'transparent',
  },
  scoreIco: {
    fontSize: 13,
  },
  scoreText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111',
  },

  bellButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  bellIcon: {
    fontSize: 18,
  },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },

  avatarCapsule: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.8,
    borderColor: PINK,
    overflow: 'hidden',
  },
  avatarContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  meAvatarTxt: {
    fontWeight: '900',
    color: '#fff',
    fontSize: 16,
  },

  section: { marginTop: 8, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '500',
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
    color: PURPLE,
    fontSize: 12,
    fontWeight: '800',
  },
  publicCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: '#ececec',
  },
  publicCardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  publicLeftColumn: { alignItems: 'center', width: 60 },
  publicAvatarWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  publicAvatar: { width: 48, height: 48, borderRadius: 24 },
  publicAvatarPlaceholder: { backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' },
  publicAvatarGlyph: { fontSize: 22 },
  publicStatusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  publicRatingBelow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 6 },
  publicRatingText: { fontSize: 11, fontWeight: '700', color: '#444' },
  publicRatingCount: { fontSize: 9, color: '#888' },
  publicInfoSection: { flex: 1, gap: 6 },
  publicCardName: { fontSize: 15, fontWeight: '700', color: '#111' },
  publicCardInterests: { fontSize: 11, color: '#666', lineHeight: 14 },
  publicCardLoc: { fontSize: 11, color: '#888', fontWeight: '500', marginTop: 2 },
  publicRightColumn: { alignItems: 'flex-end', minWidth: 70, gap: 8 },
  publicRateBtn: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 65,
    alignItems: 'center',
  },
  publicRateBtnText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  publicLanguagesRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4 },
  publicMiniLang: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
  publicMiniLangText: { fontSize: 9, fontWeight: '600', color: '#666', textTransform: 'uppercase' },
  publicMoreLang: { fontSize: 9, color: '#999', fontWeight: '500' },
  publicStatusPillRight: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  publicStatusTextRight: { fontSize: 10, fontWeight: '600' },

  availabilityCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
  },
availabilityTitle: {
  fontSize: 14,
  color: '#7b2cff',  // Change from 'purple' to actual hex color
  fontWeight: '600',
},

  availabilityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,  // Add this
  },
  powerIcon: {
    fontSize: 18,
    color: 'purple',
    fontWeight: '600',
  },

  availabilityStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  availabilityStatusText: {
    fontSize: 13,
    fontWeight: '700',
  },

  earningsMainCard: {
    borderRadius: 14,
    padding: 14,
    color: '#fff',
  },
  earningsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  earningsIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  earningsIcon: { fontSize: 18 },
  earningsSubtitle: { fontSize: 12, fontWeight: '700', color: '#fff' },
  earningsAmount: { fontSize: 36, fontWeight: '900', color: '#fff', marginTop: 4 },
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
  smallEarningsText: { color: '#16a34a', fontSize: 28, fontWeight: '900' },
  summaryErr: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyRecent: { color: '#666', fontSize: 13, paddingVertical: 8, textAlign: 'center' },
  quickActionsCol: { gap: 10 },
  muted: { color: '#888', textAlign: 'center', paddingHorizontal: 16 },
  
  // New gradient card styles
  infoSection: {
    marginTop: 8,
    paddingHorizontal: 16,
  },
  infoSectionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111',
    marginBottom: 10,
  },
  gradientCard: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  earningLevelList: {
    gap: 8,
  },
  levelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  levelTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    opacity: 0.95,
  },
  levelRate: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  levelDividerLine: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginVertical: 2,
  },
  guidelinesList: {
    gap: 10,
  },
  guidelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guideIcon: {
    marginTop: 2,
  },
  guidelineText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#fff',
    opacity: 0.95,
    flex: 1,
    lineHeight: 16,
  },
});

function CallRow({
  callerId,
  title,
  subtitle,
  callerImage,
  onMessage,
}: {
  callerId: string;
  title: string;
  subtitle: string;
  callerImage?: string | null;
  onMessage: (callerId: string, callerName: string, callerImage?: string | null) => void;
}) {
  const avatarSource = useMemo(() => resolveProfileImageSource(callerImage), [callerImage]);
  return (
    <View style={callRowStyles.row}>
      {avatarSource ? (
        <Image source={avatarSource} style={callRowStyles.avatar} />
      ) : (
        <View style={callRowStyles.avatarPlaceholder}>
          <Text style={callRowStyles.avatarText}>{title.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={callRowStyles.title}>{title}</Text>
        <Text style={callRowStyles.subtitle}>{subtitle}</Text>
      </View>
      <View style={callRowStyles.actions}>
        <TouchableOpacity
          style={callRowStyles.actionBtn}
          onPress={() => onMessage(callerId, title, callerImage)}
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
  iconName,
  onPress,
  badgeCount = 0,
}: {
  label: string;
  sublabel: string;
  iconName: string;
  onPress: () => void;
  badgeCount?: number;
}) {
  return (
    <TouchableOpacity style={quickActionStyles.btn} onPress={onPress}>
      <View style={quickActionStyles.iconBox}>
        <Ionicons name={iconName as any} size={22} color={PURPLE} />
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
      <Text style={quickActionStyles.chev}>›</Text>
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
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  title: { fontSize: 14, fontWeight: '900', color: '#111' },
  subtitle: { fontSize: 11, color: '#666', fontWeight: '700', marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTxt: { fontSize: 16 },
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
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#f5ecff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 20 },
  text: { fontSize: 14, fontWeight: '600', color: '#111' },
  sub: { fontSize: 11, color: '#777', marginTop: 2, fontWeight: '600' },
  chev: { fontSize: 20, color: '#9ca3af', fontWeight: '400', lineHeight: 22 },
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