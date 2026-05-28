import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useChatInbox } from '../../context/ChatInboxContext';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { chatApi, getErrorMessage } from '../../services/api';
import type { ChatPeerSummary } from '../../types/api';
import { resolveProfileImageSource } from '../../utils/avatarSource';

const PURPLE = '#7b2cff';
const CHAT_LIST_REFRESH_THROTTLE_MS = 12_000;

export default function ReceiverChatsList({
  listPaddingBottom = 24,
}: {
  listPaddingBottom?: number;
}): React.JSX.Element {
  const navigation = useNavigation();
  const stackNavigation = useMemo(() => {
    const parent = navigation.getParent<NativeStackNavigationProp<ReceiverStackParamList>>();
    if (parent) return parent;
    return navigation as NativeStackNavigationProp<ReceiverStackParamList>;
  }, [navigation]);
  const { getTyping, getUnreadCount, refreshUnreadFromServer } = useChatInbox();
  const [rows, setRows] = useState<ChatPeerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const lastLoadedAtRef = React.useRef(0);
  const inFlightRef = React.useRef(false);

  const load = useCallback(async (opts?: { force?: boolean }): Promise<void> => {
    const force = Boolean(opts?.force);
    const now = Date.now();
    if (!force && inFlightRef.current) return;
    if (!force && loadedOnce && now - lastLoadedAtRef.current < CHAT_LIST_REFRESH_THROTTLE_MS) return;
    inFlightRef.current = true;
    try {
      const { data } = await chatApi.conversations();
      setRows(data.conversations);
      setError(null);
      setLoadedOnce(true);
      lastLoadedAtRef.current = Date.now();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadedOnce]);

  useEffect(() => {
    void load({ force: true });
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void refreshUnreadFromServer();
      void load();
    }, [load, refreshUnreadFromServer])
  );

  const onRefresh = (): void => {
    setRefreshing(true);
    void load({ force: true });
  };

  const openConversation = useCallback(
    (item: ChatPeerSummary) => {
      stackNavigation.navigate('ReceiverChat', {
        userId: item.peerId,
        userName: item.peerName,
        userImage: item.peerImage,
      });
    },
    [stackNavigation],
  );

  const renderItem = ({ item }: { item: ChatPeerSummary }) => {
    const peerAvatar = resolveProfileImageSource(item.peerImage);
    return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => openConversation(item)}
      activeOpacity={0.7}
    >
      {peerAvatar ? (
        <Image source={peerAvatar} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPh]}>
          <Text style={styles.avatarTxt}>{item.peerName.charAt(0) ?? '?'}</Text>
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={styles.name} numberOfLines={1}>
          {item.peerName}
        </Text>
        <Text style={[styles.preview, getTyping(item.peerId) && styles.typing]} numberOfLines={1}>
          {getTyping(item.peerId) ? 'typing...' : item.lastText}
        </Text>
      </View>
      {getUnreadCount(item.peerId) > 0 ? (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadText}>
            {getUnreadCount(item.peerId) > 99 ? '99+' : String(getUnreadCount(item.peerId))}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={PURPLE} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {error ? <Text style={styles.errBanner}>{error}</Text> : null}
      <FlatList
        data={rows}
        keyExtractor={(item) => item.peerId}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyEmoji}>💬</Text>
            <Text style={styles.emptyHead}>No conversations yet</Text>
            <Text style={styles.emptySub}>When callers message you, threads appear here.</Text>
          </View>
        }
        contentContainerStyle={
          rows.length === 0
            ? [styles.emptyList, { paddingBottom: listPaddingBottom }]
            : { paddingBottom: listPaddingBottom }
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  errBanner: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '600',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyList: { flexGrow: 1 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyHead: { fontSize: 17, fontWeight: '900', color: '#111', marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ececec',
    backgroundColor: '#fff',
  },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  avatarPh: { backgroundColor: '#e8dff9', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontWeight: '900', color: PURPLE, fontSize: 18 },
  rowBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '800', color: '#111' },
  preview: { fontSize: 13, color: '#666', marginTop: 4 },
  typing: { color: PURPLE, fontWeight: '700' },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadText: { color: '#fff', fontSize: 10, fontWeight: '900' },
});
