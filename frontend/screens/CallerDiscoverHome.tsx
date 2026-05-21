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
import { CALLER_LANGUAGE_OPTIONS } from '../constants/userOnboarding';
import { CALLER_MESSAGE_REQUIRES_CALL } from '../constants/callerMessaging';
import { useAuth } from '../context/AuthContext';
import { useCallSignals } from '../context/CallSignalContext';
import { useCallerMessageEligibility } from '../context/CallerMessageEligibilityContext';
import { discoverApi, getErrorMessage } from '../services/api';
import type { DiscoverReceiverSummary } from '../types/api';
import { resolveProfileImageSource } from '../utils/avatarSource';
import { getReceiverPresenceInfo, sortDiscoverReceivers } from '../utils/receiverStatus';
import { withTimeout } from '../utils/withTimeout';
import SelectoLogo from '../assets/SelectoLogo.png'

const PURPLE = '#7b2cff';
const GREEN = '#22c55e';
/** Discover list only — shorter than generic screen timeout so home does not spin too long. */
const DISCOVER_FETCH_TIMEOUT_MS = 12_000;
const DISCOVER_POLL_MS = 5_000;

export default function CallerDiscoverHome(): React.JSX.Element {
  const isFocused = useIsFocused();
  const contentBottomPadding = useReceiverTabBarBottomInset();
  const navigation = useCallerAppNavigation();
  const { user, refreshUser } = useAuth();
  const { startCallInvite, startRandomCallEngagement, randomCallMatchingVisible } = useCallSignals();
  const { canMessageReceiver, refresh: refreshMessageEligibility } = useCallerMessageEligibility();
  const [language, setLanguage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [receivers, setReceivers] = useState<DiscoverReceiverSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<DiscoverFiltersState>(DEFAULT_DISCOVER_FILTERS);
  const [modalDraft, setModalDraft] = useState<DiscoverFiltersState>(DEFAULT_DISCOVER_FILTERS);
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
        setReceivers(rows);
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

  const refreshDiscoverSilent = useCallback((): void => {
    void withTimeout(fetchList(), DISCOVER_FETCH_TIMEOUT_MS)
      .then((rows) => {
        setReceivers(rows);
        hasDiscoverDataRef.current = rows.length > 0;
      })
      .catch(() => {
        // Keep existing cards on transient failures.
      });
  }, [fetchList]);

  useFocusEffect(
    useCallback(() => {
      refreshDiscoverSilent();
      void refreshMessageEligibility();
    }, [refreshDiscoverSilent, refreshMessageEligibility])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && isFocused) {
        refreshDiscoverSilent();
        void refreshMessageEligibility();
      }
    });
    return () => sub.remove();
  }, [isFocused, refreshDiscoverSilent, refreshMessageEligibility]);

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
    try {
      const rows = await withTimeout(fetchList(), DISCOVER_FETCH_TIMEOUT_MS);
      setReceivers(rows);
      hasDiscoverDataRef.current = rows.length > 0;
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }, [fetchList, refreshUser]);

  const wallet = typeof user?.walletBalance === 'number' && Number.isFinite(user.walletBalance) ? user.walletBalance : 0;
  const currentUserProfileImageSource = useMemo(
    () => resolveProfileImageSource(user?.profileImage),
    [user?.profileImage]
  );

  const onCall = (item: DiscoverReceiverSummary) => {
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
  };

  const onCallRandom = () => {
    if (randomCallMatchingVisible) return;
    void startRandomCallEngagement();
  };

  const onMessage = (item: DiscoverReceiverSummary) => {
    if (!canMessageReceiver(item._id)) {
      Alert.alert('Messaging locked', CALLER_MESSAGE_REQUIRES_CALL);
      return;
    }
    navigation.navigate('CallerChat', {
      receiverId: item._id,
      receiverName: item.name,
      receiverImage: item.profileImage,
    });
  };

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

  const getShortLang = (lang: string) => {
    return lang.substring(0, 3);
  };

  const renderItem = ({ item }: { item: DiscoverReceiverSummary }) => {
    const presence = getReceiverPresenceInfo(item);
    const statusColor = presence.color;
    const statusLabel = presence.label;
    const interestStr =
      item.interests.length > 0 ? item.interests.slice(0, 3).join(' • ') : '—';
    const rateLabel =
      item.audioCallRate != null && Number.isFinite(item.audioCallRate)
        ? `₹${item.audioCallRate}/min`
        : 'TBD';

    const displayedLanguages = item.languages.slice(0, 2).map(getShortLang);
    const remainingCount = item.languages.length - 2;
    const receiverAvatarSource = resolveProfileImageSource(item.profileImage);
    const canMessage = canMessageReceiver(item._id);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.92}
        onPress={() => navigation.navigate('ReceiverProfile', { receiver: item })}
      >
        <View style={styles.cardRow}>
          {/* Left Column - Avatar */}
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
              <Text style={styles.ratingCount}>({item.ratingCount})</Text>
            </View>
          </View>

          {/* Info Section - NO BUTTON HERE */}
          <View style={styles.infoSection}>
            <Text style={styles.cardName} numberOfLines={1}>
              {item.name}
              {item.age != null ? `, ${item.age}` : ''}
            </Text>

            <Text style={styles.cardInterests} numberOfLines={1}>
              {interestStr}
            </Text>

            {/* Location with rate below it */}
            {/* Location with rate card wrapper */}
<View>
  <Text style={styles.cardLoc} numberOfLines={1}>
    📍 {item.state?.trim() || 'India'}
  </Text>
  
  {/* Rate Card Wrapper */}
  <View style={styles.rateCard}>
    <Text style={styles.rateBelowLocation}> ₹5/min</Text>
  </View>
</View>
          </View>

          {/* Right Column - Languages and Status */}
          {/* Right Column - Call Button, Languages and Status */}
          <View style={styles.rightColumn}>
            <View style={styles.cardActionRow}>
              <TouchableOpacity
                style={[styles.cardActionBtn, styles.cardCallBtn, !presence.canCall && styles.cardActionBtnDisabled]}
                onPress={(e) => {
                  e.stopPropagation();
                  onCall(item);
                }}
                activeOpacity={presence.canCall ? 0.9 : 1}
                disabled={!presence.canCall}
              >
                <Text style={styles.cardActionIcon}>📞</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cardActionBtn, styles.cardChatBtn, !canMessage && styles.cardActionBtnDisabled]}
                onPress={(e) => {
                  e.stopPropagation();
                  onMessage(item);
                }}
                activeOpacity={canMessage ? 0.9 : 1}
                disabled={!canMessage}
              >
               <Ionicons name="chatbubble-outline" size={18} color={canMessage ? "#fff" : "#9ca3af"} />
              </TouchableOpacity>
            </View>

            <View style={styles.languagesRow}>
              {displayedLanguages.map((lang) => (
                <View key={lang} style={styles.miniLang}>
                  <Text style={styles.miniLangText}>{lang}</Text>
                </View>
              ))}
              {remainingCount > 0 && (
                <Text style={styles.moreLang}>+{remainingCount}</Text>
              )}
            </View>

            <View style={[styles.statusPillRight, { backgroundColor: `${statusColor}15` }]}>
              <Text style={[styles.statusTextRight, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Sticky Top Card (only logo, wallet, DP)
  const StickyTopCard = () => (
    <View style={styles.stickyTopCard}>
      <View style={styles.topSection}>
        <View style={styles.topBar}>
          <Image
            source={SelectoLogo}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <View style={styles.topRight}>
            <TouchableOpacity
              style={styles.walletCapsule}
              onPress={() => navigation.navigate('Wallet')}
              activeOpacity={0.85}
            >
              <View style={styles.walletContainer}>
                <Text style={styles.walletIco}>💰</Text>
                <Text style={styles.wallet}>₹{wallet.toLocaleString('en-IN')}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate('CallerProfile')}
              activeOpacity={0.85}
            >
              {currentUserProfileImageSource ? (
                <View style={styles.avatarCapsule}>
                  <Image source={currentUserProfileImageSource} style={styles.meAvatar} />
                </View>
              ) : (
                <View style={[styles.avatarCapsule, styles.meAvatarPh]}>
                  <View style={styles.avatarContainer}>
                    <Text style={styles.meAvatarTxt}>{user?.name?.charAt(0) ?? '?'}</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.safe}>
          {/* Sticky Top Card - Only Logo, Wallet, DP */}
          <StickyTopCard />

          {/* Scrollable Content (Promo, Search, Filters, Cards) */}
          <FlatList
            data={receivers}
            keyExtractor={(it) => it._id}
            extraData={receivers.map(
              (r) => `${r._id}:${r.isOnline}:${r.isAvailable}:${r.isBusyOnCall}:${canMessageReceiver(r._id)}`
            ).join('|')}
            renderItem={renderItem}
            contentContainerStyle={[styles.listContent, { paddingBottom: contentBottomPadding }]}
            ListHeaderComponent={
              <>
                {/* Promo Card */}
                {/* Promo Card with Purple Gradient */}
                {/* Promo Card - Redesigned with 2 columns (50-50 split) */}
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={onCallRandom}
                  disabled={randomCallMatchingVisible}
                  style={styles.promoCard}
                >
                  <LinearGradient
                    colors={['#7F00FF', '#A855F7', '#E100FF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.promoGradient}
                  >
                    <View style={styles.promoTwoColumns}>
                      {/* Left Column - Call Random Button (50%) */}
                      <View style={styles.promoLeftColumn}>
                        <View style={styles.promoBtn}>
                          <Text style={styles.promoBtnText}>
                            {randomCallMatchingVisible ? 'Please wait…' : 'Call Random'}
                          </Text>
                        </View>
                      </View>

                      {/* Right Column - Meet Someone New Text with Rate (50%) */}
                      <View style={styles.promoRightColumn}>
                        <Text style={styles.promoTitle}>Meet Someone New!</Text>
                        <Text style={styles.promoRate}> ₹5/min only</Text>
                      </View>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Search Section */}
                <View style={styles.searchSection}>
                  <View style={styles.searchRow}>
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search by name or interest…"
                      placeholderTextColor="#999"
                      value={search}
                      onChangeText={setSearch}
                    />
                    <TouchableOpacity
                      style={styles.filterBtn}
                      onPress={() => {
                        setModalDraft({ ...appliedFilters });
                        setFilterModalVisible(true);
                      }}
                      activeOpacity={0.85}
                    >
                      <DiscoverFilterIcon />
                    </TouchableOpacity>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.langScroll}>
                    {langChip('All', null)}
                    {CALLER_LANGUAGE_OPTIONS.map((l) => langChip(l, l))}
                  </ScrollView>
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
            }
            ListFooterComponent={<View style={{ height: 12 }} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              !loading && receivers.length === 0 && !err ? (
                <Text style={styles.empty}>No receivers available right now.</Text>
              ) : null
            }
            showsVerticalScrollIndicator={false}
          />
        </View>
      </KeyboardAvoidingView>
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
    borderWidth: 1.5,
    borderColor: PURPLE,
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  walletContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
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
    borderColor: PURPLE,
    overflow: 'hidden',
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: PURPLE,
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

  searchSection: {
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  langScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 6
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
    backgroundColor: 'rgba(123,44,255,0.12)',
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



  promoCard: {
    marginBottom: 16,
  },
  promoGradient: {
    borderRadius: 16,
    padding: 16,
    shadowColor: '#7F00FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  promoTwoColumns: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  promoLeftColumn: {
    width: '50%',
    alignItems: 'flex-start',
  },
  promoRightColumn: {
    width: '50%',
    alignItems: 'flex-end',
  },
  promoTitle: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'right',
    marginBottom: 4,
  },
  promoRate: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
  },
  promoBtn: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  promoBtnText: {
    color: PURPLE,
    fontWeight: '900',
    fontSize: 14,
  },

  leftColumn: {
    alignItems: 'center',
    width: 60,
  },
  avatarWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ececec',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    // REMOVE: position: 'relative',
  },

  // Update cardRow - remove paddingRight
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    // REMOVE: paddingRight: 40,
  },

  // Update cardName to allow flex
  cardName: {
    fontSize: 15,
    fontWeight: '700',
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
    marginBottom: 2, // Add this to reduce space
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
  backgroundColor: '#F0FDF4',
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

  callIconSeparateDisabled: {
    backgroundColor: '#e5e7eb',
    shadowOpacity: 0,
    elevation: 0,
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

  callButtonTopRightDisabled: {
    backgroundColor: '#e5e7eb',
    shadowOpacity: 0,
    elevation: 0,
  },



  // Keep other existing styles
  infoSection: {
    flex: 1,
    gap: 2,
  },

  cardLoc: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },


  rateBelowLocation: {
    fontSize: 10,
    color: GREEN,
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
  cardChatBtn: {
    backgroundColor: PURPLE,
    shadowColor: PURPLE,
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
    alignItems: 'center',
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