import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CallerBottomTabs, { type CallerTabBarNavigation } from '../components/caller/CallerBottomTabs';
import DiscoverFiltersModal, {
  DEFAULT_DISCOVER_FILTERS,
  DiscoverFilterIcon,
  type DiscoverFiltersState,
} from '../components/caller/DiscoverFiltersModal';
import { CALLER_LANGUAGE_OPTIONS } from '../constants/userOnboarding';
import { useAuth } from '../context/AuthContext';
import { discoverApi, getErrorMessage } from '../services/api';
import type { DiscoverReceiverSummary } from '../types/api';
import { receiverCardMetrics } from '../utils/discoverDisplay';
import { getReceiverPresenceInfo } from '../utils/receiverStatus';

const PURPLE = '#7b2cff';
const GREEN = '#22c55e';

export default function CallerDiscoverHome(): React.JSX.Element {
  const navigation = useNavigation<CallerTabBarNavigation>();
  const { user, refreshUser } = useAuth();
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
      rows = rows.filter((r) => receiverCardMetrics(r._id).rating >= 4);
    }
    if (appliedFilters.onlineOnly) {
      rows = rows.filter((r) => r.isOnline);
    }
    return rows;
  }, [language, debounced, appliedFilters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void fetchList()
      .then((rows) => {
        if (!cancelled) setReceivers(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErr(getErrorMessage(e));
          setReceivers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchList]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setErr(null);
    try {
      await refreshUser();
      const rows = await fetchList();
      setReceivers(rows);
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }, [fetchList, refreshUser]);

  const wallet = typeof user?.walletBalance === 'number' && Number.isFinite(user.walletBalance) ? user.walletBalance : 0;

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
    navigation.navigate('CallerQueue', {
      peerId: item._id,
      peerName: item.name,
      peerImage: item.profileImage ?? null,
    });
  };

  const onCallRandom = () => {
    if (randomCalling) return;
    setRandomCalling(true);
    navigation.navigate('CallerQueue');
    setRandomCalling(false);
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

  const renderItem = ({ item }: { item: DiscoverReceiverSummary }) => {
    const m = receiverCardMetrics(item._id);
    const presence = getReceiverPresenceInfo(item);
    const statusColor = presence.color;
    const statusLabel = presence.label;
    const interestStr =
      item.interests.length > 0 ? item.interests.slice(0, 4).join(' | ') : '—';
    const rateLabel =
      item.audioCallRate != null && Number.isFinite(item.audioCallRate)
        ? `₹${item.audioCallRate} / Min`
        : 'Rate TBD';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.92}
        onPress={() => navigation.navigate('ReceiverProfile', { receiver: item })}
      >
        <View style={styles.cardTop}>
          <View style={styles.avatarCol}>
            <View style={[styles.avatarWrap, styles.avatarRing, { borderColor: statusColor }]}>
              {item.profileImage ? (
                <Image source={{ uri: item.profileImage }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarGlyph}>👤</Text>
                </View>
              )}
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            </View>
            <View style={styles.ratingRow}>
              <Text style={styles.star}>★</Text>
              <Text style={styles.ratingText}>
                {m.rating} ({m.reviews})
              </Text>
            </View>
          </View>
          <View style={styles.cardMain}>
            <Text style={styles.cardName}>
              {item.name}
              {item.age != null ? `, ${item.age} Y` : ''}
            </Text>
            <Text style={styles.cardInterests} numberOfLines={2}>
              {interestStr}
            </Text>
            <Text style={styles.cardLoc}>{item.state?.trim() || '—'}</Text>
          </View>
          <View style={styles.langCol}>
            {item.languages.slice(0, 3).map((lang) => (
              <View key={lang} style={styles.miniLang}>
                <Text style={styles.miniLangText}>{lang}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.cardBottom}>
          <Text style={[styles.statusPill, { color: statusColor }]}>{statusLabel}</Text>
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
        </View>
      </TouchableOpacity>
    );
  };

  const listHeader = (
    <View style={styles.headerBlock}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>Selecto</Text>
        <View style={styles.topRight}>
          <TouchableOpacity
            style={styles.walletTap}
            onPress={() => navigation.navigate('Wallet')}
            activeOpacity={0.85}
          >
            <Text style={styles.walletIco}>👛</Text>
            <Text style={styles.wallet}>₹{wallet.toLocaleString('en-IN')}</Text>
          </TouchableOpacity>
          {user?.profileImage ? (
            <Image source={{ uri: user.profileImage }} style={styles.meAvatar} />
          ) : (
            <View style={[styles.meAvatar, styles.meAvatarPh]}>
              <Text style={styles.meAvatarTxt}>{user?.name?.charAt(0) ?? '?'}</Text>
            </View>
          )}
        </View>
      </View>

      <TouchableOpacity
        style={styles.promoPink}
        activeOpacity={0.9}
        onPress={onCallRandom}
      >
        <Text style={styles.promoTitle}>Meet Someone New!</Text>
        <View style={styles.promoBtn}>
          <Text style={styles.promoBtnText}>{randomCalling ? 'Matching…' : 'Call Random'}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.promoWhite}>
        <Text style={styles.promoWhiteTitle}>Everything Starts with a Hii!</Text>
        <Text style={styles.promoWhiteBody}>
          Spam-free chats, verified profiles, and multiple languages — pick who you connect with.
        </Text>
      </View>

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

      <Text style={styles.sectionLabel}>Language</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.langScroll}>
        {langChip('All', null)}
        {CALLER_LANGUAGE_OPTIONS.map((l) => langChip(l, l))}
      </ScrollView>

      <Text style={styles.sectionLabel}>Discover</Text>
      {err ? <Text style={styles.errText}>{err}</Text> : null}
      {loading && receivers.length === 0 ? (
        <ActivityIndicator style={styles.loader} color={PURPLE} />
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        data={receivers}
        keyExtractor={(it) => it._id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        ListFooterComponent={<View style={{ height: 72 }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>No receivers match your filters yet.</Text>
          ) : null
        }
      />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  headerBlock: { paddingBottom: 8 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  brand: { fontSize: 22, fontWeight: '900', color: '#1b4d3e' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  walletTap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  walletIco: { fontSize: 16 },
  wallet: { fontSize: 15, fontWeight: '800', color: '#111' },
  meAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e5e5e5' },
  meAvatarPh: { alignItems: 'center', justifyContent: 'center' },
  meAvatarTxt: { fontWeight: '900', color: PURPLE, fontSize: 14 },
  promoPink: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#ff72d2',
    marginBottom: 10,
  },
  promoTitle: { color: '#fff', fontSize: 18, fontWeight: '900', marginBottom: 12 },
  promoBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  promoBtnText: { color: PURPLE, fontWeight: '900', fontSize: 14 },
  promoWhite: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 14,
  },
  promoWhiteTitle: { fontSize: 15, fontWeight: '900', color: '#111', marginBottom: 6 },
  promoWhiteBody: { fontSize: 12, color: '#666', lineHeight: 18 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
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
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111',
    marginTop: 10,
    marginBottom: 8,
  },
  langScroll: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6 },
  langChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e4e4e4',
  },
  langChipActive: {
    backgroundColor: 'rgba(123,44,255,0.12)',
    borderColor: PURPLE,
  },
  langChipText: { fontSize: 13, fontWeight: '700', color: '#555' },
  langChipTextActive: { color: PURPLE },
  errText: { color: '#b91c1c', fontSize: 13, marginBottom: 8 },
  loader: { marginVertical: 16 },
  empty: { textAlign: 'center', color: '#888', marginTop: 12, fontSize: 14 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ececec',
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  avatarCol: {
    width: 76,
    alignItems: 'center',
    paddingTop: 2,
  },
  avatarWrap: { position: 'relative' },
  avatarRing: {
    borderWidth: 3,
    borderRadius: 35,
    width: 70,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarPlaceholder: { backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' },
  avatarGlyph: { fontSize: 28 },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  cardMain: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 15, fontWeight: '900', color: '#111' },
  cardLoc: { fontSize: 12, color: '#666', marginTop: 6 },
  cardInterests: { fontSize: 11, color: '#888', marginTop: 6, lineHeight: 16 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  star: { color: '#fbbf24', fontSize: 14 },
  ratingText: { fontSize: 12, fontWeight: '700', color: '#444' },
  langCol: { alignItems: 'flex-end', gap: 4 },
  miniLang: {
    backgroundColor: 'rgba(123,44,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  miniLangText: { fontSize: 10, fontWeight: '800', color: PURPLE },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  statusPill: { fontSize: 12, fontWeight: '800' },
  callBtn: {
    backgroundColor: GREEN,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  callBtnText: { color: '#fff', fontWeight: '900', fontSize: 13 },
});
