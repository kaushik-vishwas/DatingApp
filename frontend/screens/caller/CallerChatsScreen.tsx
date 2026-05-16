import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import { chatApi, getErrorMessage } from '../../services/api';
import type { ChatPeerSummary } from '../../types/api';
import { useChatInbox } from '../../context/ChatInboxContext';
import { resolveProfileImageSource } from '../../utils/avatarSource';
import { SCREEN_FETCH_TIMEOUT_MS, withTimeout } from '../../utils/withTimeout';

type Props = NativeStackScreenProps<CallerStackParamList, 'CallerChats'>;

const PURPLE = '#7b2cff';

export default function CallerChatsScreen({ navigation }: Props): React.JSX.Element {
  const { getTyping, refreshUnreadFromServer } = useChatInbox();
  const [rows, setRows] = useState<ChatPeerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadGenRef = useRef(0);

  const load = useCallback(async (opts?: { pull?: boolean }): Promise<void> => {
    const id = ++loadGenRef.current;
    if (!opts?.pull) setLoading(true);
    setError(null);
    try {
      const { data } = await withTimeout(chatApi.conversations(), SCREEN_FETCH_TIMEOUT_MS);
      if (loadGenRef.current !== id) return;
      setRows(data.conversations);
      setError(null);
    } catch (e) {
      if (loadGenRef.current !== id) return;
      setError(getErrorMessage(e));
    } finally {
      if (loadGenRef.current === id) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void refreshUnreadFromServer();
    }, [refreshUnreadFromServer])
  );

  const onRefresh = (): void => {
    setRefreshing(true);
    void load({ pull: true });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chats</Text>
        <View style={{ width: 40 }} />
      </View>

      {error && !loading ? (
        <View style={styles.errWrap}>
          <Text style={styles.errBanner}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void load({ pull: true })} activeOpacity={0.85}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={PURPLE} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.peerId}
          renderItem={({ item }) => {
            const peerAvatar = resolveProfileImageSource(item.peerImage);
            return (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                navigation.navigate('CallerChat', {
                  receiverId: item.peerId,
                  receiverName: item.peerName,
                  receiverImage: item.peerImage,
                })
              }
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
            </TouchableOpacity>
            );
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emoji}>💬</Text>
              <Text style={styles.head}>No chats yet</Text>
              <Text style={styles.sub}>Open a receiver profile and tap Message to start a conversation.</Text>
            </View>
          }
          contentContainerStyle={rows.length === 0 ? styles.emptyList : undefined}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backBtn: { padding: 10 },
  back: { fontSize: 22, color: '#111' },
  headerTitle: { fontSize: 17, fontWeight: '900', color: '#111' },
  errWrap: { marginHorizontal: 12, marginBottom: 8, gap: 8 },
  errBanner: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '600',
  },
  retryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: PURPLE,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyList: { flexGrow: 1 },
  emoji: { fontSize: 48, marginBottom: 16 },
  head: { fontSize: 18, fontWeight: '900', color: '#111', marginBottom: 8 },
  sub: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22 },
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
});
