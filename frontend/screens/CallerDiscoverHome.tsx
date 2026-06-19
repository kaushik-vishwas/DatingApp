import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useReceiverTabBarBottomInset } from '../utils/receiverTabBarInset';
import { useCallerAppNavigation } from '../utils/callerAppNavigation';
import DiscoverFiltersModal, {
  DEFAULT_DISCOVER_FILTERS,
  DiscoverFilterIcon,
  type DiscoverFiltersState,
} from '../components/caller/DiscoverFiltersModal';
import DiscoverSearchModal from '../components/caller/DiscoverSearchModal';
import { CALLER_LANGUAGE_OPTIONS } from '../constants/userOnboarding';
import { useAuth } from '../context/AuthContext';
import { useCallSignals } from '../context/CallSignalContext';
import { discoverApi, getErrorMessage, profileApi } from '../services/api';
import type { CallerNotificationContent, DiscoverReceiverSummary } from '../types/api';
import { resolveProfileImageSource } from '../utils/avatarSource';
import { getReceiverPresenceInfo, sortDiscoverReceivers } from '../utils/receiverStatus';
import { withTimeout } from '../utils/withTimeout';
import SelectoLogo from '../assets/SelectoLogo.png'
import { CallDiagnosticsTopBarButton } from '../components/call/CallDiagnosticsTopBarButton';
import { PresenceDiagnosticsTopBarButton } from '../components/call/PresenceDiagnosticsTopBarButton';
import NoticeBg from '../assets/noticeBg.png'
import RandomcallBg from '../assets/randomcallBg.png'

const PURPLE = '#7b2cff';
const GREEN = '#22c55e';
const NOTICE_GRADIENT_START = '#4ade80';
const NOTICE_GRADIENT_END = '#3B82F6';
const NOTICE_BTN_GRADIENT_START = '#7F00FF';
const NOTICE_BTN_GRADIENT_END = '#A855F7';
const NOTICE_BTN_BORDER = 'rgba(255, 255, 255, 0.45)';
const NOTICE_BTN_TEXT = '#ffffff';
const NOTICE_BTN_ICON = '#ffffff';
const RANDOM_CARD_GRADIENT_START = '#ddd6fe';
const RANDOM_CARD_GRADIENT_END = '#bae6fd';
const RANDOM_CARD_TITLE = '#4c1d95';
const RANDOM_CARD_SUBTITLE = '#6d28d9';
const RANDOM_BTN_GRADIENT_START = '#06B6D4'; // Cyan
const RANDOM_BTN_GRADIENT_END = '#8B5CF6';   // Purple
const RANDOM_BTN_BORDER = 'rgba(255, 255, 255, 0.5)';
/** Discover list only — shorter than generic screen timeout so home does not spin too long. */
const DISCOVER_FETCH_TIMEOUT_MS = 12_000;
const DISCOVER_POLL_MS = 5_000;
const listFooterSpacer = <View style={{ height: 12 }} />;

/** Stable signature for presence + card fields — skip list state updates when unchanged. */
function receiverRowSignature(r: DiscoverReceiverSummary): string {
  return [
    r._id,
    r.isOnline,
    r.isAvailable,
    r.isBusyOnCall,
    r.name,
    r.age,
    r.state,
    r.profileImage,
    r.ratingAvg,
    r.ratingCount,
    r.interests.join(','),
    r.languages.join(','),
  ].join('|');
}

function reconcileDiscoverReceivers(
  prev: DiscoverReceiverSummary[],
  next: DiscoverReceiverSummary[]
): DiscoverReceiverSummary[] {
  const prevById = new Map(prev.map((r) => [r._id, r]));
  return next.map((n) => {
    const p = prevById.get(n._id);
    if (p && receiverRowSignature(p) === receiverRowSignature(n)) return p;
    return n;
  });
}

function applyDiscoverReceivers(
  prev: DiscoverReceiverSummary[],
  next: DiscoverReceiverSummary[]
): DiscoverReceiverSummary[] {
  if (prev.length === 0) return next;
  const merged = reconcileDiscoverReceivers(prev, next);
  if (merged.length === prev.length && merged.every((row, i) => row === prev[i])) {
    return prev;
  }
  return merged;
}

type DiscoverStickyTopProps = {
  wallet: number;
  profileImageSource: ReturnType<typeof resolveProfileImageSource>;
  userInitial: string;
  onWalletPress: () => void;
  onProfilePress: () => void;
  onDiagnosticsPress: () => void;
  onPresenceDiagnosticsPress: () => void;
};

const DiscoverStickyTop = React.memo(function DiscoverStickyTop({
  wallet,
  profileImageSource,
  userInitial,
  onWalletPress,
  onProfilePress,
  onDiagnosticsPress,
  onPresenceDiagnosticsPress,
}: DiscoverStickyTopProps): React.JSX.Element {
  return (
    <View style={styles.stickyTopCard}>
      <View style={styles.topSection}>
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <Image source={SelectoLogo} style={styles.brandLogo} resizeMode="contain" />
            {/* <CallDiagnosticsTopBarButton onPress={onDiagnosticsPress} />
            <PresenceDiagnosticsTopBarButton onPress={onPresenceDiagnosticsPress} /> */}
          </View>
          <View style={styles.topRight}>
            <TouchableOpacity style={styles.walletCapsule} onPress={onWalletPress} activeOpacity={0.85}>
            <View style={styles.walletContainer}>
  <Text style={styles.wallet}>₹{wallet.toLocaleString('en-IN')}</Text>
  <View style={styles.plusIconWrapper}>
    <View style={styles.plusCircle}>
      <Ionicons name="add" size={15} color="#fff" />
    </View>
  </View>
</View>
            </TouchableOpacity>
            <TouchableOpacity onPress={onProfilePress} activeOpacity={0.85}>
  {profileImageSource ? (
    <View style={styles.avatarCapsule}>
      <Image source={profileImageSource} style={styles.meAvatar} />
    </View>
  ) : (
    <View style={[styles.avatarCapsule, styles.meAvatarPh]}>
      <View style={styles.avatarContainer}>
        <Text style={styles.meAvatarTxt}>{userInitial}</Text>
      </View>
    </View>
  )}
</TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
});

type DiscoverReceiverRowProps = {
  item: DiscoverReceiverSummary;
  onOpenProfile: (item: DiscoverReceiverSummary) => void;
  onCall: (item: DiscoverReceiverSummary) => void;
};

const DiscoverReceiverRow = React.memo(function DiscoverReceiverRow({
  item,
  onOpenProfile,
  onCall,
}: DiscoverReceiverRowProps): React.JSX.Element {
  const presence = getReceiverPresenceInfo(item);
  const statusColor = presence.color;
  const statusLabel = presence.label;
  const interestStr = item.interests.length > 0 ? item.interests.slice(0, 3).join(' | ') : '—';
  const displayedLanguages = item.languages.slice(0, 2).map((lang) => lang.substring(0, 3));
  const remainingCount = item.languages.length - 2;
  const receiverAvatarSource = resolveProfileImageSource(item.profileImage);

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.92}
    // onPress={() => onOpenProfile(item)}
    >
      <View style={styles.cardRow}>
        <View style={styles.leftColumn}>
          <View style={[styles.avatarWrapper, { borderColor: statusColor }]}>
            {receiverAvatarSource ? (
              <Image source={receiverAvatarSource} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarGlyph}>👤</Text>
              </View>
            )}
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          </View>
          <View style={styles.ratingBelow}>
            <Text style={styles.star}>★</Text>
            <Text style={styles.ratingText}>{item.ratingAvg}</Text>
            {/* <Text style={styles.ratingCount}>({item.ratingCount})</Text> */}
          </View>
        </View>
        <View style={styles.infoSection}>
          <View style={styles.nameInterestWrapper}>
            <Text style={styles.cardName} numberOfLines={1}>
              {item.name}
              {item.age != null ? `, ${item.age} Y` : ''}
            </Text>
            <Text style={styles.cardInterests} numberOfLines={1}>
              {interestStr}
            </Text>
          </View>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={12} color="#EF4444" />
            <Text style={styles.cardLoc} numberOfLines={1}>
              {item.state?.trim() || 'India'}
            </Text>
          </View>
          <View style={styles.rateCard}>
            <Text style={styles.rateBelowLocation}> ₹5/min</Text>
          </View>
        </View>
        <View style={styles.rightColumn}>
          <View style={styles.languagesRow}>
            {displayedLanguages.map((lang) => (
              <View key={lang} style={styles.miniLang}>
                <Text style={styles.miniLangText}>{lang}</Text>
              </View>
            ))}
            {remainingCount > 0 ? <Text style={styles.moreLang}>+{remainingCount}</Text> : null}
          </View>
          <TouchableOpacity
            style={[styles.callNowButton, !presence.canCall && styles.callNowButtonDisabled]}
            onPress={(e) => {
              e.stopPropagation();
              onCall(item);
            }}
            activeOpacity={presence.canCall ? 0.9 : 1}
            disabled={!presence.canCall}
          >
            <View style={styles.callNowButtonContent}>
              <Ionicons name="call-outline" size={16} color="#fff" />
              <Text style={styles.callNowButtonText}> Call</Text>
            </View>
          </TouchableOpacity>
          <View style={[styles.statusPillRight, { backgroundColor: `${statusColor}15` }]}>
            <Text style={[styles.statusTextRight, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function CallerDiscoverHome(): React.JSX.Element {
  const isFocused = useIsFocused();
  const contentBottomPadding = useReceiverTabBarBottomInset();
  const navigation = useCallerAppNavigation();
  const { user, refreshUser } = useAuth();
  const { startCallInvite, startRandomCallEngagement, randomCallMatchingVisible } = useCallSignals();
  const [language, setLanguage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [receivers, setReceivers] = useState<DiscoverReceiverSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<DiscoverFiltersState>(DEFAULT_DISCOVER_FILTERS);
  const [modalDraft, setModalDraft] = useState<DiscoverFiltersState>(DEFAULT_DISCOVER_FILTERS);
  const [callerNotification, setCallerNotification] = useState<CallerNotificationContent | null>(null);
  const discoverLoadGenRef = useRef(0);
  const hasDiscoverDataRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchList = useCallback(async (): Promise<DiscoverReceiverSummary[]> => {
    const useModalLangs = appliedFilters.languages.length > 0;
    const ageFilterActive = appliedFilters.ageMin !== 18 || appliedFilters.ageMax !== 50;
    const { data } = await discoverApi.listReceivers({
      language: useModalLangs ? undefined : language ?? undefined,
      q: debounced || undefined,
      langs: useModalLangs ? appliedFilters.languages.join(',') : undefined,
      minAge: ageFilterActive ? appliedFilters.ageMin : undefined,
      maxAge: ageFilterActive ? appliedFilters.ageMax : undefined,
      limit: 80,
    });
    let rows = data.receivers;
    if (appliedFilters.rating4Plus) {
      rows = rows.filter((r) => (r.ratingAvg ?? 0) >= 4);
    }
    if (appliedFilters.onlineOnly) {
      rows = rows.filter((r) => {
        const presence = getReceiverPresenceInfo(r);
        return presence.status === 'available';
      });
    }
    return sortDiscoverReceivers(rows);
  }, [language, debounced, appliedFilters]);

  const fetchDiscoverReceivers = useCallback(
    async (opts?: { silent?: boolean }): Promise<void> => {
      const id = ++discoverLoadGenRef.current;
      const silent = opts?.silent ?? hasDiscoverDataRef.current;
      if (!silent) {
        setLoading(true);
        setErr(null);
      }
      try {
        const rows = await withTimeout(fetchList(), DISCOVER_FETCH_TIMEOUT_MS);
        if (discoverLoadGenRef.current !== id) return;
        setReceivers((prev) => applyDiscoverReceivers(prev, rows));
        setErr(null);
        hasDiscoverDataRef.current = rows.length > 0;
      } catch (e: unknown) {
        if (discoverLoadGenRef.current !== id) return;
        if (!silent) {
          setErr(getErrorMessage(e));
          setReceivers([]);
          hasDiscoverDataRef.current = false;
        }
      } finally {
        if (discoverLoadGenRef.current === id) setLoading(false);
      }
    },
    [fetchList]
  );

  useEffect(() => {
    void fetchDiscoverReceivers();
    return () => {
      discoverLoadGenRef.current += 1;
    };
  }, [fetchDiscoverReceivers]);

  const loadCallerNotification = useCallback(async (): Promise<void> => {
    try {
      const { data } = await profileApi.callerNotification();
      setCallerNotification(data.callerNotification);
    } catch {
      // Optional card — ignore failures.
    }
  }, []);

  const refreshDiscoverSilent = useCallback((): void => {
    void withTimeout(fetchList(), DISCOVER_FETCH_TIMEOUT_MS)
      .then((rows) => {
        setReceivers((prev) => applyDiscoverReceivers(prev, rows));
        hasDiscoverDataRef.current = rows.length > 0;
      })
      .catch(() => {
        // Keep existing cards on transient failures.
      });
  }, [fetchList]);

  useFocusEffect(
    useCallback(() => {
      refreshDiscoverSilent();
      void loadCallerNotification();
    }, [refreshDiscoverSilent, loadCallerNotification])
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && isFocused) {
        refreshDiscoverSilent();
      }
    });
    return () => sub.remove();
  }, [isFocused, refreshDiscoverSilent]);

  useEffect(() => {
    if (!isFocused) return;
    refreshDiscoverSilent();
    const poll = setInterval(refreshDiscoverSilent, DISCOVER_POLL_MS);
    return () => clearInterval(poll);
  }, [isFocused, refreshDiscoverSilent]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setErr(null);
    void refreshUser();
    void loadCallerNotification();
    try {
      const rows = await withTimeout(fetchList(), DISCOVER_FETCH_TIMEOUT_MS);
      setReceivers((prev) => applyDiscoverReceivers(prev, rows));
      hasDiscoverDataRef.current = rows.length > 0;
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }, [fetchList, refreshUser, loadCallerNotification]);

  const showCallerNotification =
    callerNotification != null &&
    callerNotification.enabled !== false &&
    Boolean(callerNotification.title?.trim() || callerNotification.body?.trim());

  const wallet = typeof user?.walletBalance === 'number' && Number.isFinite(user.walletBalance) ? user.walletBalance : 0;
  const currentUserProfileImageSource = useMemo(
    () => resolveProfileImageSource(user?.profileImage),
    [user?.profileImage]
  );

  const onCall = useCallback(
    (item: DiscoverReceiverSummary) => {
      const presence = getReceiverPresenceInfo(item);
      if (!presence.canCall) {
        Alert.alert('Unavailable', `${item.name} is ${presence.label.toLowerCase()}.`);
        return;
      }
      const rate = item.audioCallRate;
      if (rate == null || !Number.isFinite(rate)) {
        Alert.alert('Unavailable', 'This receiver has not set a call rate yet.');
        return;
      }
      if (wallet < rate) {
        navigation.navigate('Wallet');
        return;
      }
      void (async () => {
        try {
          await startCallInvite(item._id, item.name, item.profileImage ?? null, {
            receiverRatePerMinuteHint:
              item.audioCallRate != null && Number.isFinite(item.audioCallRate) ? item.audioCallRate : undefined,
            redirectToRandomOnMissed: true,
          });
        } catch (e: unknown) {
          Alert.alert('Call failed', getErrorMessage(e));
        }
      })();
    },
    [navigation, startCallInvite, wallet]
  );

  const onCallRandom = useCallback(() => {
    if (randomCallMatchingVisible) return;
    void startRandomCallEngagement();
  }, [randomCallMatchingVisible, startRandomCallEngagement]);


  const onOpenProfile = useCallback(
    (item: DiscoverReceiverSummary) => {
      navigation.navigate('ReceiverProfile', { receiver: item });
    },
    [navigation]
  );

  const onWalletPress = useCallback(() => {
    navigation.navigate('Wallet');
  }, [navigation]);

  const onProfilePress = useCallback(() => {
    navigation.navigate('CallerProfile');
  }, [navigation]);

  const onDiagnosticsPress = useCallback(() => {
    navigation.navigate('CallDiagnostics');
  }, [navigation]);

  const onPresenceDiagnosticsPress = useCallback(() => {
    navigation.navigate('PresenceDiagnostics');
  }, [navigation]);

  const openFilterModal = useCallback(() => {
    setModalDraft({ ...appliedFilters });
    setFilterModalVisible(true);
  }, [appliedFilters]);

  const openSearchModal = useCallback(() => {
    setSearchDraft(search);
    setSearchModalVisible(true);
  }, [search]);

  const applySearch = useCallback(() => {
    setSearch(searchDraft.trim());
    setSearchModalVisible(false);
  }, [searchDraft]);

  const hasActiveSearch = debounced.length > 0;

  const renderReceiverRow = useCallback(
    ({ item }: { item: DiscoverReceiverSummary }) => (
      <DiscoverReceiverRow
        item={item}
        onOpenProfile={onOpenProfile}
        onCall={onCall}
      />
    ),
    [onCall, onOpenProfile]
  );

  const langChip = (label: string, value: string | null) => {
    const active = language === value;
    return (
      <TouchableOpacity
        key={label + String(value)}
        style={[styles.langChip, active && styles.langChipActive]}
        onPress={() => setLanguage(value)}
        activeOpacity={0.85}
      >
        <Text style={[styles.langChipText, active && styles.langChipTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const listHeader = useMemo(
    () => (
      <>
        {showCallerNotification && callerNotification ? (
          <LinearGradient
            colors={[NOTICE_GRADIENT_START, NOTICE_GRADIENT_END]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.adminNoticeCard}
          >
            <Image source={NoticeBg} style={styles.adminNoticeBgImage} resizeMode="cover" />
            <View style={styles.adminNoticeBgScrim} />
            <View style={styles.adminNoticeRow}>
              <View style={styles.adminNoticeLeft}>
                <View style={styles.adminNoticeBtnWrap}>
                  <LinearGradient
                    colors={[NOTICE_BTN_GRADIENT_START, NOTICE_BTN_GRADIENT_END]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.adminNoticeBtn}
                  >
                    <TouchableOpacity
                      onPress={onWalletPress}
                      activeOpacity={0.88}
                      style={styles.adminNoticeBtnHit}
                    >
                      <View style={styles.adminNoticeBtnContent}>
                        <Ionicons name="wallet-outline" size={18} color={NOTICE_BTN_ICON} />
                        <Text style={styles.adminNoticeBtnText} numberOfLines={2}>
                          {callerNotification.title?.trim() || 'Announcement'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </LinearGradient>
                </View>
              </View>
              {callerNotification.body?.trim() ? (
                <View style={styles.adminNoticeRight}>
                  <Text style={styles.adminNoticeBody}>{callerNotification.body.trim()}</Text>
                </View>
              ) : null}
            </View>
          </LinearGradient>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onCallRandom}
          disabled={randomCallMatchingVisible}
          style={styles.randomCallCardWrap}
        >
          <LinearGradient
            colors={[RANDOM_CARD_GRADIENT_START, RANDOM_CARD_GRADIENT_END]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.randomCallCard}
          >
            <Image source={RandomcallBg} style={styles.randomCallBgImage} resizeMode="cover" />
            <View style={styles.randomCallBgScrim} />
            <View style={styles.randomCallRow}>
              <View style={styles.randomCallLeft}>
                <View style={styles.randomCallBtnWrap}>
                  <LinearGradient
                    colors={[RANDOM_BTN_GRADIENT_START, RANDOM_BTN_GRADIENT_END]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.randomCallBtn}
                  >
                    <View style={styles.randomCallBtnContent}>
                      {!randomCallMatchingVisible ? (
                        <Ionicons name="shuffle-outline" size={16} color={NOTICE_BTN_ICON} />
                      ) : (
                        <ActivityIndicator size="small" color={NOTICE_BTN_ICON} />
                      )}
                      <Text style={styles.randomCallBtnText}>
                        {randomCallMatchingVisible ? 'Please wait…' : 'Random Call'}
                      </Text>
                      {!randomCallMatchingVisible ? (
                        <View style={styles.randomCallIconBadge}>
                          <Ionicons name="call-outline" size={12} color="#fff" />
                        </View>
                      ) : null}
                    </View>
                  </LinearGradient>
                </View>
              </View>
              <View style={styles.randomCallRight}>
                <Text style={styles.randomCallTitle}>Meet Someone New!</Text>
                <Text style={styles.randomCallRate}>₹5/min only</Text>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.filterBarRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.langScrollArea}
            contentContainerStyle={styles.langScroll}
          >
            {langChip('All', null)}
            {CALLER_LANGUAGE_OPTIONS.map((l) => langChip(l, l))}
          </ScrollView>
          <TouchableOpacity
            style={[styles.filterBarIconBtn, hasActiveSearch && styles.filterBarIconBtnActive]}
            onPress={openSearchModal}
            activeOpacity={0.85}
            accessibilityLabel="Search receivers"
          >
            <Ionicons name="search-outline" size={22} color={hasActiveSearch ? PURPLE : '#444'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.filterBarIconBtn}
            onPress={openFilterModal}
            activeOpacity={0.85}
            accessibilityLabel="Filter receivers"
          >
            <DiscoverFilterIcon />
          </TouchableOpacity>
        </View>

        {err ? (
          <View style={styles.errBlock}>
            <Text style={styles.errText}>{err}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => void fetchDiscoverReceivers()}
              activeOpacity={0.85}
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {loading && receivers.length === 0 ? (
          <ActivityIndicator style={styles.loader} color={PURPLE} />
        ) : null}
      </>
    ),
    [
      callerNotification,
      err,
      fetchDiscoverReceivers,
      hasActiveSearch,
      language,
      loading,
      onCallRandom,
      onWalletPress,
      openFilterModal,
      openSearchModal,
      randomCallMatchingVisible,
      receivers.length,
      showCallerNotification,
    ]
  );

  const listEmpty = useMemo(
    () =>
      !loading && receivers.length === 0 && !err ? (
        <Text style={styles.empty}>No receivers available right now.</Text>
      ) : null,
    [err, loading, receivers.length]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.safe}>
          <DiscoverStickyTop
            wallet={wallet}
            profileImageSource={currentUserProfileImageSource}
            userInitial={user?.name?.charAt(0) ?? '?'}
            onWalletPress={onWalletPress}
            onProfilePress={onProfilePress}
            onDiagnosticsPress={onDiagnosticsPress}
            onPresenceDiagnosticsPress={onPresenceDiagnosticsPress}
          />

          <FlatList
            data={receivers}
            keyExtractor={(it) => it._id}
            renderItem={renderReceiverRow}
            contentContainerStyle={[styles.listContent, { paddingBottom: contentBottomPadding }]}
            ListHeaderComponent={listHeader}
            ListFooterComponent={listFooterSpacer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={listEmpty}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={Platform.OS === 'android'}
            windowSize={7}
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            updateCellsBatchingPeriod={50}
          />
        </View>
      </KeyboardAvoidingView>
      <DiscoverSearchModal
        visible={searchModalVisible}
        draft={searchDraft}
        setDraft={setSearchDraft}
        onClose={() => setSearchModalVisible(false)}
        onApply={applySearch}
      />
      <DiscoverFiltersModal
        visible={filterModalVisible}
        draft={modalDraft}
        setDraft={setModalDraft}
        onClose={() => setFilterModalVisible(false)}
        onReset={() => setModalDraft({ ...DEFAULT_DISCOVER_FILTERS })}
        onApply={() => {
          setAppliedFilters({ ...modalDraft });
          setFilterModalVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7' },

  stickyTopCard: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },

  // Enhanced Top Section Styles
  topSection: {
    backgroundColor: '#fff',
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

  walletCapsule: {
    borderRadius: 40,
    borderWidth: 1,
    borderColor: '#00a2ff',
    backgroundColor: '#e5e5e5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  walletContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,  // Reduced from 14
    paddingVertical: 8,
    gap: 4,  // Reduced from 6
    backgroundColor: 'transparent',
  },
  walletIco: {
    fontSize: 16,
  },
  wallet: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111',
  },

  avatarCapsule: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#00a2ff',  // Changed from PURPLE to match wallet
    overflow: 'hidden',
    shadowColor: '#00a2ff',  // Changed from PURPLE
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#00a2ff',  // Changed from PURPLE to match wallet
    alignItems: 'center',
    justifyContent: 'center',
  },
  meAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  meAvatarPh: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  meAvatarTxt: {
    fontWeight: '900',
    color: '#fff',
    fontSize: 18,
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
    backgroundColor: '#00a2ff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00a2ff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },

  matchOverlay: {
    flex: 1,
    backgroundColor: '#121018',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  matchWaveArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 24,
  },
  matchRippleHub: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    overflow: 'visible',
  },
  matchRippleCircle: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 104,
    height: 104,
    marginLeft: -52,
    marginTop: -52,
    borderRadius: 52,
    borderWidth: 2.5,
    borderColor: 'rgba(174,140,255,0.9)',
    backgroundColor: 'transparent',
  },
  matchRippleCore: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#c4b5fd',
    zIndex: 2,
  },
  matchTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  matchSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 12,
    lineHeight: 20,
  },
  matchCallerRow: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  matchCallerAvatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 3,
    borderColor: '#fff',
  },
  matchCallerAvatarPh: {
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchCallerInitial: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
  },
  matchYouLabel: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '700',
  },

  filterBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  langScrollArea: {
    flex: 1,
    minWidth: 0,
  },
  langScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 4,
  },
  filterBarIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  filterBarIconBtnActive: {
    borderColor: PURPLE,
    backgroundColor: 'rgba(123,44,255,0.08)',
  },
  langChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e4e4e4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  langChipActive: {
    backgroundColor: '#FFF0FA',
    borderColor: PURPLE,
  },
  langChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555'
  },
  langChipTextActive: {
    color: PURPLE
  },
  errBlock: {
    marginBottom: 10,
    alignItems: 'center',
    gap: 8,
  },
  retryBtn: {
    backgroundColor: PURPLE,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  errText: {
    color: '#b91c1c',
    fontSize: 13,
    marginBottom: 0,
    textAlign: 'center',
  },
  loader: {
    marginVertical: 16
  },
  empty: {
    textAlign: 'center',
    color: '#888',
    marginTop: 12,
    fontSize: 14
  },



  randomCallCardWrap: {
    marginBottom: 6,
  },
  randomCallCard: {
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    overflow: 'hidden',
    minHeight: 60,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  randomCallBgImage: {
    position: 'absolute',
    right: 2,
    bottom: 1,
    width: 100,
    height: 60,
    opacity: 0.44,
  },
  randomCallBgScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
  },
  randomCallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    position: 'relative',
    zIndex: 2,
  },
  randomCallLeft: {
    flexGrow: 0,
    flexShrink: 0,
    width: '45%',
    minWidth: 158,
    justifyContent: 'center',
    paddingRight: 2,
  },
  randomCallBtnWrap: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#0d9488',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 4,
  },
  randomCallBtn: {
    width: '100%',
    minHeight: 40,
    borderWidth: 1,
    borderColor: RANDOM_BTN_BORDER,
    borderRadius: 20,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  randomCallBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    width: '100%',
  },
  randomCallBtnText: {
    flexShrink: 0,
    color: NOTICE_BTN_TEXT,
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  randomCallIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  randomCallRight: {
    flex: 1,
    flexShrink: 1,
    justifyContent: 'center',
    paddingLeft: 6,
    paddingRight: 2,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(124, 58, 237, 0.22)',
  },
  randomCallTitle: {
    color: RANDOM_CARD_TITLE,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 17,
    marginBottom: 1,
  },
  randomCallRate: {
    color: RANDOM_CARD_SUBTITLE,
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.9,
  },
  adminNoticeCard: {
    marginBottom: 10,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    overflow: 'hidden',
    minHeight: 60,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  adminNoticeBgImage: {
    position: 'absolute',
    right: 2,
    bottom: -18,
    width: 140,
    height: 140,
    opacity: 0.44,
  },
  adminNoticeBgScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30, 27, 75, 0.32)',
  },
  adminNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    position: 'relative',
    zIndex: 2,
  },
  adminNoticeLeft: {
    flexGrow: 0,
    flexShrink: 0,
    width: '40%',
    minWidth: 120,
    justifyContent: 'center',
    paddingRight: 4,
  },
  adminNoticeBtnWrap: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#4c1d95',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  adminNoticeBtn: {
    width: '100%',
    minHeight: 42,
    borderWidth: 1,
    borderColor: NOTICE_BTN_BORDER,
    borderRadius: 20,
    overflow: 'hidden',
  },
  adminNoticeBtnHit: {
    width: '100%',
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  adminNoticeBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
  },
  adminNoticeBtnText: {
    flexShrink: 1,
    color: NOTICE_BTN_TEXT,
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  adminNoticeRight: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.25)',
  },
  adminNoticeBody: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    lineHeight: 18,
  },
  leftColumn: {
    alignItems: 'center',
    width: 60,
  },
  avatarWrapper: {
    width: 67,
    height: 67,
    borderRadius: 35,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatar: {
    width: 61,
    height: 61,
    borderRadius: 35,
  },
  avatarPlaceholder: {
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlyph: {
    fontSize: 22,
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  ratingBelow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    marginTop: 6,
  },
  star: {
    color: '#fbbf24',
    fontSize: 10,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#444',
  },
  ratingCount: {
    fontSize: 9,
    color: '#888',
  },


  // Add this new style for the name row layout
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  // Add inline call button styles (replaces top-right absolute button)
  callButtonInline: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },

  callButtonInlineDisabled: {
    backgroundColor: '#e5e7eb',
    shadowOpacity: 0,
    elevation: 0,
  },

  // Update card - remove position relative (no longer needed)
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#ececec',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    // REMOVE: position: 'relative',
  },

  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  // Update cardRow - remove paddingRight
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16, // Changed from 8 to 16 for more spacing
  },

  // Update cardName to allow flex
  cardName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    flex: 1, // ADD THIS
  },

  // Remove or comment out these styles (no longer needed):
  // callButtonTopRight
  // callButtonTopRightDisabled
  // callButtonIcon (keep if not conflicting, but the inline one uses same name)

  // Keep all other existing styles unchanged
  cardInterests: {
    fontSize: 11,
    color: '#666',
    lineHeight: 14,
    marginBottom: 0,
    marginTop: 0,  // Change from 2 to 0
  },


  callBtn: {
    backgroundColor: GREEN,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 65,
    alignItems: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },

  // Add wrapper/card for the rate section
  // Update rateCard to be an inline badge (width fits content)
  rateCard: {
    backgroundColor: PURPLE,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    alignSelf: 'flex-start', // This makes the width fit the content
  },

  callBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 11,
  },
  callBtnDisabled: {
    backgroundColor: '#e5e7eb',
    shadowOpacity: 0,
    elevation: 0,
  },
  callBtnTextDisabled: {
    color: '#9ca3af',
  },
  languagesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 4,
  },
  miniLang: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
  miniLangText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
  },
  moreLang: {
    fontSize: 9,
    color: '#999',
    fontWeight: '500',
  },
  statusPillRight: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },

  // Add new call icon separate styles
  callIconSeparate: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },

  callNowButton: {
    backgroundColor: '#00A86B',
    paddingHorizontal: 9,      // Further reduced from 12 to 8
    paddingVertical: 7,        // Further reduced from 6 to 4
    borderRadius: 15,          // Further reduced from 16 to 12
    minWidth: 65,              // Further reduced from 85 to 65
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },


  callNowButtonDisabled: {
    backgroundColor: '#8FD18F',
    shadowOpacity: 0,
    elevation: 0,
  },


  callNowButtonText: {
    color: '#fff',
    fontWeight: '500',         // Further reduced from 600 to 500
    fontSize: 12,               // Further reduced from 10 to 9
    letterSpacing: 0.2,       // Further reduced from 0.3 to 0.2
  },


  callNowButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,                   // Further reduced from 4 to 2
  },

  callIconText: {
    fontSize: 20,
    color: '#fff',
  },

  // Add this new style for the top-right call button
  callButtonTopRight: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },

  callIconWrapper: {
    width: 27,
    height: 27,
    borderRadius: 16,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#fb5880',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  nameInterestWrapper: {
    flexDirection: 'column',
    marginBottom: 0,
    paddingBottom: 0,
    gap: 0,  // No gap between name and interest
  },

  callButtonTopRightDisabled: {
    backgroundColor: '#e5e7eb',
    shadowOpacity: 0,
    elevation: 0,
  },

  // Keep other existing styles
  infoSection: {
    flex: 1,
    gap: 0,
  },

  cardLoc: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
    flex: 1,  // Add this to allow text to shrink
  },
  rateBelowLocation: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '800',
    // Remove marginTop: 2,
  },

  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  cardActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  cardCallBtn: {
    backgroundColor: GREEN,
    shadowColor: GREEN,
  },

  cardActionBtnDisabled: {
    backgroundColor: '#e5e7eb',
    shadowOpacity: 0,
    elevation: 0,
  },
  cardActionIcon: {
    fontSize: 16,
  },
  cardActionIconDisabled: {
    opacity: 0.45,
  },

  // Update rightColumn to align items center
  rightColumn: {
    alignItems: 'flex-end',  // Changed from 'center' to 'flex-end' for right alignment
    minWidth: 70,
    gap: 8,
  },

  // Remove these styles if they exist:
  // callButtonTopRight, callButtonTopRightDisabled
  // callButtonInline, callButtonInlineDisabled
  // nameRow (unless used elsewhere)
  // Remove old callBtn styles if not needed
  statusTextRight: {
    fontSize: 10,
    fontWeight: '600',
  },
});