import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
import EarningsCardBg from '../assets/earnBg.png';
import InstructionsCardBg from '../assets/instructionBg.png';
import { useReceiverTabBarBottomInset } from '../utils/receiverTabBarInset';

const INSTRUCTIONS_GRADIENT_START = '#A855F7';
const INSTRUCTIONS_GRADIENT_END = '#F4C430';

const PURPLE = '#7b2cff';
const PINK = '#ff72d2';
const SKY_BLUE_START = '#3B82F6';
const SKY_BLUE_END = '#8E2DE2';
const DEEP_PURPLE_START = '#8E2DE2';
const DEEP_PURPLE_END = '#4A00E0';

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

type CompactInfoCardProps = {
  colors: [string, string];
  bgImage: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

function CompactInfoCard({ colors, bgImage, title, subtitle, children }: CompactInfoCardProps): React.JSX.Element {
  return (
    <View style={styles.infoSection}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.compactGradientCard}>
        <Image source={bgImage} style={styles.cardBgImage} resizeMode="cover" />
        <View style={styles.cardBgScrim} />
        <View style={styles.cardForeground}>
          <View style={styles.compactTitleRow}>
            <Text style={styles.gradientCardTitle}>{title}</Text>
            <Text style={styles.compactSubtitle}>{subtitle}</Text>
          </View>
          {children}
        </View>
      </LinearGradient>
    </View>
  );
}

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
  const showScoreInTopBar = callInsights?.receiverEarningModel !== 'fixed_per_minute';

  const isFixedEarning = callInsights?.receiverEarningModel === 'fixed_per_minute';
  const earningLevelRows = useMemo(() => {
    type LevelIcon = 'white-balance-sunny' | 'weather-sunset' | 'moon-waning-crescent' | 'medal-outline' | 'diamond-stone' | 'crown';
    if (isFixedEarning && callInsights?.fixedPerMinuteWindows?.length) {
      const iconById: Record<string, LevelIcon> = {
        day: 'white-balance-sunny',
        evening: 'weather-sunset',
        night: 'moon-waning-crescent',
      };
      return callInsights.fixedPerMinuteWindows.map((w) => ({
        id: w.id,
        label: w.label || `${w.from} – ${w.to}`,
        rate: `₹${w.ratePerMinute}/min`,
        icon: iconById[w.id] ?? 'white-balance-sunny',
      }));
    }
    if (!isFixedEarning) {
      return [
        { id: 'platinum', label: 'Platinum', rate: '₹2/min', icon: 'medal-outline' as LevelIcon },
        { id: 'diamond', label: 'Diamond', rate: '₹2.3/min', icon: 'diamond-stone' as LevelIcon },
        { id: 'supreme', label: 'Supreme', rate: '₹2.6/min', icon: 'crown' as LevelIcon },
      ];
    }
    return [
      { id: 'day', label: '6 AM – 9 PM', rate: '₹2/min', icon: 'white-balance-sunny' as LevelIcon },
      { id: 'evening', label: '9 PM – 11 PM', rate: '₹2.2/min', icon: 'weather-sunset' as LevelIcon },
      { id: 'night', label: '11 PM – 6 AM', rate: '₹2.5/min', icon: 'moon-waning-crescent' as LevelIcon },
    ];
  }, [callInsights?.fixedPerMinuteWindows, isFixedEarning]);

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
              {showScoreInTopBar ? (
                <TouchableOpacity
                  style={styles.scoreCapsule}
                  onPress={() => navigation.navigate('ReceiverProfilePreview')}
                  activeOpacity={0.85}
                >
                  <View style={styles.scoreContainer}>
                    <Text style={styles.scoreIco}>🏆</Text>
                    <Text style={styles.scoreText}>
                      {trophyScoreRounded.toLocaleString('en-IN')}
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : null}

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
                    </View>
                  </View>
                  <View style={styles.publicInfoSection}>
                    <Text style={styles.publicCardName} numberOfLines={1}>
                      {user.name}
                      {user.age != null ? `, ${user.age}` : ''}
                    </Text>
                    <Text style={styles.publicCardInterests} numberOfLines={1}>
                      {(user.interests ?? []).length > 0
                        ? user.interests.slice(0, 3).join(' | ')
                        : '—'}
                    </Text>
                    <Text style={styles.publicCardLoc} numberOfLines={1}>
                      {user.state?.trim() || '—'}
                    </Text>

                    {/* Rate button moved here - below state */}
                    <View style={styles.publicRateBtnInline}>
                      <Text style={styles.publicRateBtnText}>
                        {typeof user.audioCallRate === 'number' && Number.isFinite(user.audioCallRate)
                          ? `₹${user.audioCallRate}/min`
                          : '₹5/min'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.publicRightColumn}>
                   
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

            {/* Go Online Card with Earnings Summary Card Color Combination */}
            <View style={styles.availabilityCardWrapper}>
              <LinearGradient
                colors={[PURPLE, PINK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.highlightedAvailabilityCard}
              >
                <View style={styles.availabilityLeft}>
                  <Ionicons name="power-outline" size={24} color="#fff" />
                  <Text style={styles.availabilityTitle}>Go Online</Text>
                </View>
                <View style={styles.availabilityStatusRow}>
                  {/* <Text style={[styles.availabilityStatusText, { color: available ? '#fff' : '#fff' }]}>
                    {available ? '🟢 You Are Online' : '🟡 You Are Offline'}
                  </Text> */}
                  <Switch
                    value={available}
                    onValueChange={(next) => void onToggleAvailability(next)}
                    trackColor={{ false: '#e5e5e5', true: 'rgba(255,255,255,0.5)' }}
                    thumbColor={available ? '#fff' : '#f59e0b'}
                  />
                </View>
              </LinearGradient>
            </View>

            <CompactInfoCard
              colors={[SKY_BLUE_START, SKY_BLUE_END]}
              bgImage={EarningsCardBg}
              title="Earning Levels"
              subtitle={isFixedEarning ? 'IST time slots' : 'Score badges'}
            >
              <View style={styles.earningLevelList}>
                {earningLevelRows.map((row, index) => (
                  <React.Fragment key={row.id}>
                    {index > 0 ? <View style={styles.levelDividerLine} /> : null}
                    <View style={styles.levelRow}>
                      <View style={styles.levelLeft}>
                        <View style={styles.levelIconBadge}>
                          <MaterialCommunityIcons name={row.icon} size={14} color="#1e3a8a" />
                        </View>
                        <Text style={styles.levelTime}>{row.label}</Text>
                      </View>
                      <Text style={styles.levelRate}>{row.rate}</Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            </CompactInfoCard>

            <CompactInfoCard
              colors={[INSTRUCTIONS_GRADIENT_START, INSTRUCTIONS_GRADIENT_END]}
              bgImage={InstructionsCardBg}
              title="Instructions"
              subtitle="Stay safe & professional"
            >
              <View style={styles.guidelinesList}>
                <View style={styles.guidelineRow}>
                  <View style={styles.guideIconBadge}>
                    <MaterialCommunityIcons name="clock-check-outline" size={14} color="#312e81" />
                  </View>
                  <Text style={styles.guidelineText}>Stay online at least 8 hours per day.</Text>
                </View>
                <View style={styles.guidelineRow}>
                  <View style={styles.guideIconBadge}>
                    <MaterialCommunityIcons name="shield-lock-outline" size={14} color="#312e81" />
                  </View>
                  <Text style={styles.guidelineText}>Don't share phone, UPI, or personal IDs.</Text>
                </View>
                <View style={styles.guidelineRow}>
                  <View style={styles.guideIconBadge}>
                    <MaterialCommunityIcons name="phone-cancel-outline" size={14} color="#312e81" />
                  </View>
                  <Text style={styles.guidelineText}>Block rude or inappropriate callers.</Text>
                </View>
              </View>
            </CompactInfoCard>

            {/* Earnings Summary Section - With inline icons */}
            <View style={styles.infoSection}>
              <LinearGradient
                colors={[PURPLE, PINK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.fullGradientCard}
              >
                {summaryError ? <Text style={styles.summaryErr}>{summaryError}</Text> : null}

                {/* Row 1: Title with Icon on Left, Amount on Right */}
                <View style={styles.earningsRow}>
                  <View style={styles.earningsTitleWrapper}>
                    <Ionicons name="card-outline" size={20} color="#fff" />
                    <Text style={styles.earningsTitle}>Total Earnings</Text>
                  </View>
                  <Text style={styles.totalEarningsAmount}>
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
                </View>

                {/* {callInsights ? (
                  <Text style={styles.earningModelNote}>
                    {callInsights.receiverEarningModel === 'fixed_per_minute'
                      ? `Fixed rate · ₹${(callInsights.earningRatePerMinute ?? 0).toLocaleString('en-IN')}/min now (IST)`
                      : `Score based · ${(callInsights.badgeLevel ?? 'platinum').toUpperCase()} · ₹${(callInsights.earningRatePerMinute ?? 0).toLocaleString('en-IN')}/min`}
                  </Text>
                ) : null} */}

                {/* Row 2: Today and 7 Days earnings side by side with icons */}
                <View style={styles.smallEarningsRow}>
                  <View style={styles.smallEarningsCard}>
                    <View style={styles.smallEarningsHeader}>
                      <Ionicons name="today-outline" size={14} color="#fff" style={styles.smallEarningsIcon} />
                      <Text style={styles.smallEarningsLabel}>Earned today</Text>
                    </View>
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
                    <View style={styles.smallEarningsHeader}>
                      <Ionicons name="calendar-outline" size={14} color="#fff" style={styles.smallEarningsIcon} />
                      <Text style={styles.smallEarningsLabel}>Earned in 7 days</Text>
                    </View>
                    <Text style={[styles.smallEarningsText, { color: '#fff' }]}>
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
              </LinearGradient>
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
  publicInfoSection: { flex: 1, gap: 0 },
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

  availabilityCardWrapper: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 0,
  },
  highlightedAvailabilityCard: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  availabilityTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '700',
  },
  availabilityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
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

  infoSection: {
    marginTop: 10,
    paddingHorizontal: 16,
  },
  fullGradientCard: {
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  compactGradientCard: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    overflow: 'hidden',
    minHeight: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  cardBgImage: {
    position: 'absolute',
    right: -14,
    bottom: -18,
    width: 140,
    height: 140,
    opacity: 0.44,
  },
  cardBgScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30, 27, 75, 0.32)',
  },
  cardForeground: {
    zIndex: 1,
    paddingRight: 36,
  },
  compactTitleRow: {
    marginBottom: 8,
  },
  gradientCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  compactSubtitle: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.82)',
  },
  earningLevelList: {
    gap: 0,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    gap: 6,
  },
  levelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  levelIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  levelTime: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    opacity: 0.95,
  },
  levelRate: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    flexShrink: 0,
  },
  levelDividerLine: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginVertical: 1,
  },
  guidelinesList: {
    gap: 6,
  },
  guidelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guideIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  guidelineText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    lineHeight: 15,
  },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  earningsTitleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  earningsTitleIcon: {
    marginRight: 4,
  },
  earningsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  earningModelNote: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
  },
  totalEarningsWrapper: {
    alignItems: 'flex-end',
  },
  totalEarningsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    opacity: 0.8,
    marginBottom: 4,
  },

  earningsColumn: {
    marginBottom: 20,
  },

  totalEarningsAmount: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
  },
  smallEarningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  smallEarningsCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 12,
  },
  smallEarningsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  smallEarningsIcon: {
    opacity: 0.9,
  },
  smallEarningsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    opacity: 0.9,
  },
  smallEarningsText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  summaryErr: {
    color: '#ffeb3b',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
  },

  publicRateBtnInline: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 8,
    minWidth: 65,
    alignItems: 'center',
    marginTop: 8,  // Add spacing from state
    alignSelf: 'flex-start',  // Left align instead of full width
  },
  emptyRecent: { color: '#666', fontSize: 13, paddingVertical: 8, textAlign: 'center' },
  quickActionsCol: { gap: 10 },
  muted: { color: '#888', textAlign: 'center', paddingHorizontal: 16 },
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