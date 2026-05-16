import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import CallerBottomTabs, {
  getCallerTabBarContentPadding,
  type CallerTabBarNavigation,
} from '../components/caller/CallerBottomTabs';
import DiscoverFiltersModal, {
  DEFAULT_DISCOVER_FILTERS,
  DiscoverFilterIcon,
  type DiscoverFiltersState,
} from '../components/caller/DiscoverFiltersModal';
import { CALLER_LANGUAGE_OPTIONS } from '../constants/userOnboarding';
import { useAuth } from '../context/AuthContext';
import { useCallSignals } from '../context/CallSignalContext';
import { callApi, discoverApi, getErrorMessage } from '../services/api';
import type { DiscoverReceiverSummary } from '../types/api';
import { resolveProfileImageSource } from '../utils/avatarSource';
import { startRandomMatchingTone } from '../utils/callSounds';
import { getReceiverPresenceInfo } from '../utils/receiverStatus';
import { SCREEN_FETCH_TIMEOUT_MS, withTimeout } from '../utils/withTimeout';
import SelectoLogo from '../assets/SelectoLogo.png'

const PURPLE = '#7b2cff';
const GREEN = '#22c55e';

const RANDOM_MATCH_RING_EXPAND_MS = 2400;
const RANDOM_MATCH_RING_CYCLE_MS =
  RANDOM_MATCH_RING_EXPAND_MS + 2 * (RANDOM_MATCH_RING_EXPAND_MS / 3);

export default function CallerDiscoverHome(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const contentBottomPadding = getCallerTabBarContentPadding(insets.bottom);
  const navigation = useNavigation<CallerTabBarNavigation>();
  const { user, refreshUser } = useAuth();
  const { startCallInvite } = useCallSignals();
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
  const [randomCalling, setRandomCalling] = useState(false);
  const randomRingPulse0 = useRef(new Animated.Value(0)).current;
  const randomRingPulse1 = useRef(new Animated.Value(0)).current;
  const randomRingPulse2 = useRef(new Animated.Value(0)).current;
  const discoverLoadGenRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      setRandomCalling(false);
    }, [])
  );

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
      rows = rows.filter((r) => r.isOnline);
    }
    // Filter out offline receivers
    rows = rows.filter((r) => r.isOnline === true);
    return rows;
  }, [language, debounced, appliedFilters]);

  const fetchDiscoverReceivers = useCallback(async (): Promise<void> => {
    const id = ++discoverLoadGenRef.current;
    setLoading(true);
    setErr(null);
    try {
      const rows = await withTimeout(fetchList(), SCREEN_FETCH_TIMEOUT_MS);
      if (discoverLoadGenRef.current !== id) return;
      setReceivers(rows);
      setErr(null);
    } catch (e: unknown) {
      if (discoverLoadGenRef.current !== id) return;
      setErr(getErrorMessage(e));
      setReceivers([]);
    } finally {
      if (discoverLoadGenRef.current === id) setLoading(false);
    }
  }, [fetchList]);

  useEffect(() => {
    void fetchDiscoverReceivers();
    return () => {
      discoverLoadGenRef.current += 1;
    };
  }, [fetchDiscoverReceivers]);

  useEffect(() => {
    if (!isFocused) return;
    void withTimeout(fetchList(), SCREEN_FETCH_TIMEOUT_MS)
      .then((rows) => {
        setReceivers((prev) => {
          if (prev.length === rows.length && prev.every((p, i) => p._id === rows[i]?._id)) {
            return prev;
          }
          return rows;
        });
      })
      .catch(() => {
        // Keep existing cards on transient failures.
      });
    return;
  }, [fetchList, isFocused]);

  useEffect(() => {
    const rings = [randomRingPulse0, randomRingPulse1, randomRingPulse2];
    if (!randomCalling) {
      for (const v of rings) {
        v.stopAnimation(() => v.setValue(0));
      }
      return;
    }
    const stagger = RANDOM_MATCH_RING_EXPAND_MS / 3;
    const loops = rings.map((v, i) => {
      const lead = i * stagger;
      const tail = RANDOM_MATCH_RING_CYCLE_MS - lead - RANDOM_MATCH_RING_EXPAND_MS;
      return Animated.loop(
        Animated.sequence([
          Animated.delay(lead),
          Animated.timing(v, {
            toValue: 1,
            duration: RANDOM_MATCH_RING_EXPAND_MS,
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.delay(Math.max(0, tail)),
        ])
      );
    });
    for (const l of loops) {
      l.start();
    }
    return () => {
      for (const l of loops) {
        l.stop();
      }
    };
  }, [randomCalling, randomRingPulse0, randomRingPulse1, randomRingPulse2]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setErr(null);
    try {
      await refreshUser();
      const rows = await withTimeout(fetchList(), SCREEN_FETCH_TIMEOUT_MS);
      setReceivers(rows);
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
        });
      } catch (e: unknown) {
        Alert.alert('Call failed', getErrorMessage(e));
      }
    })();
  };

  const onCallRandom = () => {
    if (randomCalling) return;
    setRandomCalling(true);
    void (async () => {
      let stopMatchSound: (() => Promise<void>) | undefined;
      const MAX_RANDOM_RETRIES = 3;
      const isRetryableRandomInviteError = (message: string): boolean => {
        const msg = message.toLowerCase();
        if (msg.includes('declined by receiver')) return false;
        return (
          msg.includes('offline') ||
          msg.includes('unavailable') ||
          msg.includes('busy') ||
          msg.includes('not available') ||
          msg.includes('cannot call this receiver')
        );
      };
      try {
        stopMatchSound = await startRandomMatchingTone();
        let lastErr: unknown = null;
        for (let attempt = 0; attempt < MAX_RANDOM_RETRIES; attempt += 1) {
          try {
            const { data } = await callApi.randomReceiver();
            const rate =
              typeof data.audioCallRate === 'number' && Number.isFinite(data.audioCallRate)
                ? data.audioCallRate
                : null;
            if (rate != null && wallet < rate) {
              navigation.navigate('Wallet');
              return;
            }
            await stopMatchSound?.();
            stopMatchSound = undefined;
            await startCallInvite(data.receiverId, data.name, data.profileImage ?? null, {
              receiverRatePerMinuteHint:
                rate != null && Number.isFinite(rate) ? rate : undefined,
            });
            return;
          } catch (e: unknown) {
            lastErr = e;
            const msg = getErrorMessage(e);
            if (!isRetryableRandomInviteError(msg) || attempt === MAX_RANDOM_RETRIES - 1) {
              throw e;
            }
          }
        }
        throw lastErr ?? new Error('No available receiver found right now. Please try again shortly.');
      } catch (e: unknown) {
        Alert.alert('Random call', getErrorMessage(e));
      } finally {
        await stopMatchSound?.();
        setRandomCalling(false);
      }
    })();
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

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.92}
        onPress={() => navigation.navigate('ReceiverProfile', { receiver: item })}
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
              <Text style={styles.ratingCount}>({item.ratingCount})</Text>
            </View>
          </View>

          <View style={styles.infoSection}>
            <Text style={styles.cardName} numberOfLines={1}>
              {item.name}
              {item.age != null ? `, ${item.age}` : ''}
            </Text>
            
            <Text style={styles.cardInterests} numberOfLines={1}>
              {interestStr}
            </Text>
            
            <Text style={styles.cardLoc} numberOfLines={1}>
              {item.state?.trim() || '—'}
            </Text>
          </View>

          <View style={styles.rightColumn}>
            <TouchableOpacity
              style={styles.callBtn}
              onPress={(e) => {
                e.stopPropagation();
                onCall(item);
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.callBtnText}>{rateLabel}</Text>
            </TouchableOpacity>
            
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
            renderItem={renderItem}
            contentContainerStyle={[styles.listContent, { paddingBottom: contentBottomPadding }]}
            ListHeaderComponent={
              <>
                {/* Promo Card */}
              {/* Promo Card with Purple Gradient */}
<TouchableOpacity
  activeOpacity={0.9}
  onPress={onCallRandom}
>
  <LinearGradient
    colors={['#7F00FF', '#A855F7', '#E100FF']}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={styles.promoGradient}
  >
    <Text style={styles.promoTitle}>Meet Someone New!</Text>
    <View style={styles.promoBtn}>
      <Text style={styles.promoBtnText}>{randomCalling ? 'Please wait…' : 'Call Random'}</Text>
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
      <CallerBottomTabs active="home" navigation={navigation} />

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

      <Modal visible={randomCalling} animationType="fade" statusBarTranslucent>
        <View style={styles.matchOverlay}>
          <View style={styles.matchWaveArea}>
            <View style={styles.matchRippleHub}>
              <Animated.View
                style={[
                  styles.matchRippleCircle,
                  {
                    opacity: randomRingPulse0.interpolate({
                      inputRange: [0, 0.1, 0.5, 1],
                      outputRange: [0, 0.55, 0.2, 0],
                    }),
                    transform: [
                      {
                        scale: randomRingPulse0.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.42, 3.95],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.matchRippleCircle,
                  {
                    opacity: randomRingPulse1.interpolate({
                      inputRange: [0, 0.1, 0.5, 1],
                      outputRange: [0, 0.55, 0.2, 0],
                    }),
                    transform: [
                      {
                        scale: randomRingPulse1.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.42, 3.95],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.matchRippleCircle,
                  {
                    opacity: randomRingPulse2.interpolate({
                      inputRange: [0, 0.1, 0.5, 1],
                      outputRange: [0, 0.55, 0.2, 0],
                    }),
                    transform: [
                      {
                        scale: randomRingPulse2.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.42, 3.95],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <View style={styles.matchRippleCore} />
            </View>
            <Text style={styles.matchTitle}>Connecting you…</Text>
            <Text style={styles.matchSub}>Hang tight while we pair you with someone.</Text>
          </View>

          <View style={styles.matchCallerRow}>
            {currentUserProfileImageSource ? (
              <Image source={currentUserProfileImageSource} style={styles.matchCallerAvatar} />
            ) : (
              <View style={[styles.matchCallerAvatar, styles.matchCallerAvatarPh]}>
                <Text style={styles.matchCallerInitial}>{user?.name?.charAt(0) ?? '?'}</Text>
              </View>
            )}
            <Text style={styles.matchYouLabel}>You</Text>
          </View>
        </View>
      </Modal>
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
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },

  promoGradient: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#7F00FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  promoTitle: { 
    color: '#fff', 
    fontSize: 18, 
    fontWeight: '900', 
    marginBottom: 12 
  },
  promoBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  promoBtnText: { 
    color: PURPLE, 
    fontWeight: '900', 
    fontSize: 14 
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
  
  infoSection: {
    flex: 1,
    gap: 6,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  cardInterests: {
    fontSize: 11,
    color: '#666',
    lineHeight: 14,
  },
  cardLoc: {
    fontSize: 11,
    color: '#888',
    fontWeight: '500',
    marginTop: 2,
  },
  
  rightColumn: {
    alignItems: 'flex-end',
    minWidth: 70,
    gap: 8,
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
  callBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 11,
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
  statusTextRight: {
    fontSize: 10,
    fontWeight: '600',
  },
});