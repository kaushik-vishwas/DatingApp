import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'react-native';
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
import { useCallSignals } from '../context/CallSignalContext';
import { useChatInbox } from '../context/ChatInboxContext';
import type { ReceiverStackParamList } from '../navigation/ReceiverStackParamList';
import {
  countUnreadByTimestamp,
  getNotificationLastSeenAt,
  markNotificationsSeenNow,
} from '../services/notificationUnread';
import { chatApi, getErrorMessage, profileApi } from '../services/api';
import type {
  ReceiverCallInsightsResponse,
  ReceiverWalletSummaryResponse,
  ReceiverWelcomeContent,
} from '../types/api';
import { type ReceiverPresenceInfo } from '../utils/receiverStatus';
import { resolveProfileImageSource } from '../utils/avatarSource';
import SelectoLogo from '../assets/SelectoLogo.png';
import { CallDiagnosticsTopBarButton } from '../components/call/CallDiagnosticsTopBarButton';
import { PresenceDiagnosticsTopBarButton } from '../components/call/PresenceDiagnosticsTopBarButton';
import EarningsCardBg from '../assets/earnBg.png';
import InstructionsCardBg from '../assets/instructionBg.png';
import NoticeBg from '../assets/noticeBg.png'
import { useReceiverTabBarBottomInset } from '../utils/receiverTabBarInset';
import { CHAT_RECEIVER_EARN_LABEL } from '../constants/chatPricing';

const INSTRUCTIONS_GRADIENT_START = '#A855F7';
const INSTRUCTIONS_GRADIENT_END = '#F4C430';



const MAROON = 'purple'
const GREEN1 = '#4ade80'
const GREEN2 = '#059669'
const PURPLE = '#7b2cff';
const PINK = '#ff72d2';
const PURPLE2 = '#9a5cff';
const PINK2 = '#ff9ee5';
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
  bgImageStyle?: object;
};



function CompactInfoCard({ colors, bgImage, title, subtitle, children, bgImageStyle }: CompactInfoCardProps): React.JSX.Element {
  return (
    <View style={styles.infoSection}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.compactGradientCard}>
        <Image source={bgImage} style={bgImageStyle || styles.cardBgImage} resizeMode="cover" />
        <View style={styles.cardBgScrim} />
        <View style={styles.cardForeground}>
          <View style={styles.compactTitleRow}>
            <Text style={styles.gradientCardTitle}>{title}</Text>
            {/* {subtitle ? <Text style={styles.compactSubtitle}>{subtitle}</Text> : null} */}
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
  const [receiverWelcome, setReceiverWelcome] = useState<ReceiverWelcomeContent | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [notificationUnread, setNotificationUnread] = useState(0);
  const scrollBottomInset = useReceiverTabBarBottomInset();
  const { setQueueMode } = useCallSignals();

  const receiverId = user?.role === 'receiver' ? user._id : undefined;
  const autoAvailabilityAppliedForRef = React.useRef<string | null>(null);
  const availabilityFromServer =
    user?.role === 'receiver' ? Boolean(user.isAvailable ?? false) : false;

  React.useEffect(() => {
    setAvailable(availabilityFromServer);
  }, [availabilityFromServer]);

  React.useEffect(() => {
    if (!receiverId || user?.role !== 'receiver') return;
    if (user.isAvailable === true) {
      autoAvailabilityAppliedForRef.current = receiverId;
      return;
    }
    if (autoAvailabilityAppliedForRef.current === receiverId) return;
    autoAvailabilityAppliedForRef.current = receiverId;
    setAvailable(true);
    void (async () => {
      try {
        await profileApi.updateReceiverProfile({ isAvailable: true });
        try {
          await setQueueMode(true);
        } catch {
          // Queue sync is best-effort if the call socket is still connecting.
        }
        void refreshUser();
      } catch {
        setAvailable(Boolean(user.isAvailable ?? false));
      }
    })();
  }, [receiverId, user?.role, user?.isAvailable, refreshUser, setQueueMode]);



  const loadWalletSummary = useCallback(async () => {
    if (!receiverId) return;
    setSummaryError(null);
    try {
      const { data } = await profileApi.receiverWalletSummary();
      setWalletSummary(data);
      if (data.receiverWelcome) {
        setReceiverWelcome(data.receiverWelcome);
      }
    } catch (e) {
      setSummaryError(getErrorMessage(e));
    }
  }, [receiverId]);

  const loadCallInsights = useCallback(async () => {
    if (!receiverId) return;
    try {
      const { data } = await profileApi.receiverCallInsights('all');
      setCallInsights(data);
      if (data.receiverWelcome) {
        setReceiverWelcome(data.receiverWelcome);
      }
    } catch (e) {
      setSummaryError((prev) => prev ?? getErrorMessage(e));
    }
  }, [receiverId]);

  const loadReceiverWelcome = useCallback(async () => {
    if (!receiverId) return;
    try {
      const { data } = await profileApi.receiverWelcome();
      setReceiverWelcome(data.receiverWelcome);
    } catch {
      // Optional endpoint; call-insights may still provide welcome content.
    }
  }, [receiverId]);


  // Add this inside your component, before the return statement
  React.useEffect(() => {
    StatusBar.setBarStyle('dark-content');
    StatusBar.setBackgroundColor('white'); // Match your background
  }, []);

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
      void loadReceiverWelcome();
      void loadReceiverNotificationUnread();
      void refreshUser();
      void refreshUnreadFromServer();
    }, [
      receiverId,
      loadWalletSummary,
      loadCallInsights,
      loadReceiverWelcome,
      loadReceiverNotificationUnread,
      refreshUser,
    ])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refreshUser(),
      loadWalletSummary(),
      loadCallInsights(),
      loadReceiverWelcome(),
      loadReceiverNotificationUnread(),
    ]);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      if (!receiverId || !available) return;
      void setQueueMode(true).catch(() => { });
    }, [receiverId, available, setQueueMode])
  );

  const onToggleAvailability = async (next: boolean) => {
    const prev = available;
    setAvailable(next);
    try {
      await profileApi.updateReceiverProfile({ isAvailable: next });
      try {
        await setQueueMode(next);
      } catch {
        // Queue sync is best-effort if the call socket is still connecting.
      }
      void refreshUser();
    } catch (e) {
      setAvailable(prev);
      Alert.alert('Update failed', getErrorMessage(e));
    }
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
    type LevelIcon =
      | 'weather-sunny'
      | 'white-balance-sunny'
      | 'weather-sunset'
      | 'moon-waning-crescent'
      | 'medal-outline'
      | 'diamond-stone'
      | 'crown';
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
      { id: 'day', label: '6 AM – 9 PM', rate: '₹1.8/min', icon: 'white-balance-sunny' as LevelIcon },
      { id: 'evening', label: '9 PM – 11 PM', rate: '₹1.9/min', icon: 'weather-sunset' as LevelIcon },
      { id: 'night', label: '11 PM – 6 AM', rate: '₹2/min', icon: 'moon-waning-crescent' as LevelIcon },
    ];
  }, [callInsights?.fixedPerMinuteWindows, isFixedEarning]);

  const showReceiverWelcome =
    receiverWelcome != null &&
    receiverWelcome.enabled !== false &&
    Boolean(receiverWelcome.title?.trim() || receiverWelcome.body?.trim());

  const totalEarningsLifetime = useMemo(() => {
    if (!walletSummary) return 0;
    if (
      typeof walletSummary.totalEarningsLifetime === 'number' &&
      Number.isFinite(walletSummary.totalEarningsLifetime)
    ) {
      return walletSummary.totalEarningsLifetime;
    }
    const call =
      typeof walletSummary.callEarningsLifetime === 'number' ? walletSummary.callEarningsLifetime : 0;
    const chat =
      typeof walletSummary.chatEarningsLifetime === 'number' ? walletSummary.chatEarningsLifetime : 0;
    return call + chat;
  }, [walletSummary]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: scrollBottomInset }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.topSection}>
          <View style={styles.topBar}>
            <View style={styles.topBarLeft}>
              <Image
                source={SelectoLogo}
                style={styles.brandLogo}
                resizeMode="contain"
              />
              {/* <CallDiagnosticsTopBarButton
                onPress={() => navigation.navigate('CallDiagnostics')}
              />
              <PresenceDiagnosticsTopBarButton
                onPress={() => navigation.navigate('PresenceDiagnostics')}
              /> */}
            </View>
            <View style={styles.topRight}>
              {showScoreInTopBar ? (
                <TouchableOpacity
                  style={styles.scoreCapsule}
                  onPress={() => navigation.navigate('ReceiverProfilePreview')}
                  activeOpacity={0.85}
                >
                  {/* <View style={styles.scoreContainer}>
                    <Text style={styles.scoreIco}>🏆</Text>
                    <Text style={styles.scoreText}>
                      {trophyScoreRounded.toLocaleString('en-IN')}
                    </Text>
                  </View> */}
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.earningsCapsule}
                onPress={() => navigation.navigate('WithdrawEarnings')}
                activeOpacity={0.85}
              >
                <View style={styles.earningsContainer}>
                  <Text style={styles.earningsIco}>💰</Text>
                  <Text style={styles.earningsText} numberOfLines={1}>
                    {formatInr(totalEarningsLifetime)}
                  </Text>
                  {/* <View style={styles.plusIconWrapper}>
    <View style={styles.plusCircle}>
      <Ionicons name="add" size={15} color="#fff" />
    </View>
  </View> */}
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
                          backgroundColor:
                            publicPresence.status === 'offline'
                              ? '#ffedd5'
                              : '#dcfce7',

                          borderWidth: 1,

                          borderColor:
                            publicPresence.status === 'offline'
                              ? '#f59e0b'
                              : '#22c55e',
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
                colors={[MAROON, SKY_BLUE_START]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.highlightedAvailabilityCard}
              >
                <View style={styles.availabilityCentered}>
                  <Ionicons name="power-outline" size={24} color="#fff" />
                  <Text style={styles.availabilityTitle}>Go Online</Text>
                  <Switch
                    value={available}
                    onValueChange={(next) => void onToggleAvailability(next)}
                    trackColor={{ false: '#e5e5e5', true: '#86efac' }}
                    thumbColor={available ? '#22c55e' : '#f59e0b'}
                    ios_backgroundColor="#e5e7eb"
                    style={{ transform: [{ scaleX: 1.6 }, { scaleY: 1.6 }] }}
                  />
                </View>
              </LinearGradient>
            </View>

            <View style={styles.infoSection}>
              {summaryError ? <Text style={styles.summaryErrInline}>{summaryError}</Text> : null}
              <View style={styles.smallEarningsRow}>
                <LinearGradient
                  colors={[PURPLE, PINK]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.smallEarningsCard}
                >
                  <View style={styles.smallEarningsHeader}>
                    <Ionicons name="call-outline" size={14} color="#fff" style={styles.smallEarningsIcon} />
                    <Text style={styles.smallEarningsLabel}>Earned today by calls</Text>
                  </View>
                  <Text style={styles.smallEarningsText}>
                    {walletSummary
                      ? formatInr(
                        typeof walletSummary.callEarningsToday === 'number'
                          ? walletSummary.callEarningsToday
                          : 0
                      )
                      : '₹0'}
                  </Text>
                </LinearGradient>
                <LinearGradient
                  colors={[PURPLE, PINK]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.smallEarningsCard}
                >
                  <View style={styles.smallEarningsHeader}>
                    <Ionicons name="chatbubbles-outline" size={14} color="#fff" style={styles.smallEarningsIcon} />
                    <Text style={styles.smallEarningsLabel}>Earned today by chats</Text>
                  </View>
                  <Text style={styles.smallEarningsText}>
                    {walletSummary
                      ? formatInr(
                        typeof walletSummary.chatToday === 'number' ? walletSummary.chatToday : 0
                      )
                      : '₹0'}
                  </Text>
                </LinearGradient>
              </View>
            </View>


            <CompactInfoCard
              colors={[SKY_BLUE_START, SKY_BLUE_END]}
              bgImage={EarningsCardBg}
              title="Earning Levels"
              subtitle={isFixedEarning ? 'IST time slots' : 'Score badges'}
            >
              <View style={styles.earningLevelsGrid}>
                <View style={styles.earningLevelsRow}>
                  {earningLevelRows.map((row) => (
                    <View key={row.id} style={styles.earningGridCol}>
                      <View style={styles.earningGridTopRow}>
                        <View style={styles.levelIconBadge}>
                          <MaterialCommunityIcons name={row.icon} size={14} color="white" />
                        </View>
                        <View style={styles.earningTextStack}>
                          <Text style={styles.earningGridLabel} numberOfLines={2}>
                            {row.label}
                          </Text>
                          <Text style={styles.earningGridRate}>{row.rate}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
                <View style={styles.earningLevelDivider} />
                <View style={styles.earningGridLabelRow}>
                  <View style={styles.levelIconBadge}>
                    <MaterialCommunityIcons name="message-text-outline" size={14} color="white" />
                  </View>
                  <Text style={styles.chatEarnSideNote}>
                    You will earn {CHAT_RECEIVER_EARN_LABEL} per text
                  </Text>
                </View>
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
                    <MaterialCommunityIcons name="clock-check-outline" size={14} color="white" />
                  </View>
                  <Text style={styles.guidelineText}>Stay online at least 8 hours per day.</Text>
                </View>
                <View style={styles.guidelineRow}>
                  <View style={styles.guideIconBadge}>
                    <MaterialCommunityIcons name="shield-lock-outline" size={14} color="white" />
                  </View>
                  <Text style={styles.guidelineText}>Don't share phone, UPI, or personal IDs.</Text>
                </View>
                <View style={styles.guidelineRow}>
                  <View style={styles.guideIconBadge}>
                    <MaterialCommunityIcons name="phone-cancel-outline" size={14} color="white" />
                  </View>
                  <Text style={styles.guidelineText}>Block rude or inappropriate callers.</Text>
                </View>
              </View>
            </CompactInfoCard>


          </>
        ) : (
          <Text style={styles.muted}>Could not load profile.</Text>
        )}

        {showReceiverWelcome && receiverWelcome ? (
          <CompactInfoCard
            colors={[GREEN1, SKY_BLUE_START]}
            bgImage={NoticeBg}
            bgImageStyle={styles.welcomeCardBgImage}  // ← ADD THIS
            title={receiverWelcome.title?.trim() || 'Notice Board'}
            subtitle=""
          >
            <View style={styles.welcomeCardContent}>
              {receiverWelcome.body?.trim() ? (
                <Text style={styles.welcomeCardBody}>{receiverWelcome.body.trim()}</Text>
              ) : null}
            </View>
          </CompactInfoCard>
        ) : null}
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
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: '#fff',
    // borderBottomLeftRadius: 24,
    // borderBottomRightRadius: 24,
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
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
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
  earningsCapsule: {
    borderRadius: 40,
    borderWidth: 1,
    borderColor: '#00a2ff',
    backgroundColor: '#e5e5e5',
    maxWidth: 140,    // Changed from 120 to 140
    minWidth: 100,    // Added minimum width for better size
    paddingHorizontal: 2, // Added for better spacing
  },
  
  earningsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,  // Changed from 8 to 12
    paddingVertical: 8,     // Changed from 6 to 8
    gap: 6,                 // Changed from 4 to 6
  },
  
  earningsIco: {
    fontSize: 14,     // Changed from 14 to 16
  },
  
  earningsText: {
    fontSize: 14,     // Changed from 12 to 14
    fontWeight: '800',
    color: '#111',
    flexShrink: 1,
  },

  bellButton: {
    width: 40,
    height: 40,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5e5e5',
    borderWidth: 1,
    borderColor: '#00a2ff',
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
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: '#00a2ff',
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
    width: 39,
    height: 39,
    borderRadius: 20,
  },
  meAvatarTxt: {
    fontWeight: '900',
    color: '#fff',
    fontSize: 16,
  },

  section: { marginTop: 0, paddingHorizontal: 16 },
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
    backgroundColor: '#f3e7ff',
    borderRadius: 5,
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
    width: 62,
    height: 62,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  publicAvatar: { width: 57, height: 57, borderRadius: 30 },
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
    backgroundColor: '#fefce8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#9a5cff',  // Purple border
  },
  publicMiniLangText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7b2cff',  // Purple text
    textTransform: 'uppercase'
  },
  publicStatusPillRight: { paddingHorizontal: 13, paddingVertical: 5, borderRadius: 20 },
  publicStatusTextRight: { fontSize: 12, fontWeight: '700' },

  availabilityCardWrapper: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 0,
  },
  highlightedAvailabilityCard: {
    borderRadius: 5,
    // paddingHorizontal: 10,
    paddingVertical: 8,
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
    fontSize: 20,
    color: '#fff',
    fontWeight: '700',
  },
  availabilityCentered: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    flex: 1,
  },
  availabilityStatusText: {
    fontSize: 1,
    fontWeight: '700',
  },

  welcomeCardContent: {
    minHeight: 100,
  },
  welcomeCardBody: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    lineHeight: 18,
  },
  infoSection: {
    marginTop: 10,
    paddingHorizontal: 16,
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

  welcomeCardBgImage: {
    position: 'absolute',
    right: 2,        // ← Move left instead of right
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
  earningLevelsGrid: {
    gap: 0,
  },
  earningLevelsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  earningGridCol: {
    flex: 1,
    minWidth: 105,
  },
  earningGridTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  earningTextStack: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  earningGridLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  levelIconBadge: {
    width: 18,
    height: 18,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(108, 45, 255, 0.47)',
  },
  earningGridLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'left',
    lineHeight: 13,
  },
  earningLevelDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginVertical: 5,
  },
  earningGridRate: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'left',
    lineHeight: 15,
  },
  chatEarnSideNote: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'left',
    lineHeight: 15,
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
    backgroundColor: 'rgba(158, 76, 229, 0.68)',
  },
  guidelineText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    lineHeight: 15,
  },
  smallEarningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  smallEarningsCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  plusIconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 0,
  },
  plusCircle: {
    width: 25,
    height: 25,
    borderRadius: 14,
    backgroundColor: '#00a2ff', // Bluish color
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00a2ff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    opacity: 0.9,
  },
  smallEarningsText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  summaryErrInline: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
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
  // quickActionsCol: { gap: 10 },
  muted: { color: '#888', textAlign: 'center', paddingHorizontal: 16 },
});

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