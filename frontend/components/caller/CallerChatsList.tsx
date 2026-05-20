import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { CALLER_MESSAGE_REQUIRES_CALL } from '../../constants/callerMessaging';
import { useCallerMessageEligibility } from '../../context/CallerMessageEligibilityContext';
import { useChatInbox } from '../../context/ChatInboxContext';
import { chatApi, getErrorMessage } from '../../services/api';
import type { ChatPeerSummary } from '../../types/api';
import { useCallerAppNavigation } from '../../utils/callerAppNavigation';
import { resolveProfileImageSource } from '../../utils/avatarSource';
import { SCREEN_FETCH_TIMEOUT_MS, withTimeout } from '../../utils/withTimeout';

const PURPLE = '#7b2cff';

export default function CallerChatsList({
  listPaddingBottom,
}: {
  listPaddingBottom: number;
}): React.JSX.Element {
  const navigation = useCallerAppNavigation();
  const { canMessageReceiver } = useCallerMessageEligibility();
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
    <View style={styles.root}>
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
            const canMessage = canMessageReceiver(item.peerId);
            return (
              <TouchableOpacity
                style={[styles.row, !canMessage && styles.rowDisabled]}
                onPress={() => {
                  if (!canMessage) {
                    Alert.alert('Messaging locked', CALLER_MESSAGE_REQUIRES_CALL);
                    return;
                  }
                  navigation.navigate('CallerChat', {
                    receiverId: item.peerId,
                    receiverName: item.peerName,
                    receiverImage: item.peerImage,
                  });
                }}
                activeOpacity={canMessage ? 0.7 : 1}
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
          contentContainerStyle={[
            rows.length === 0 ? styles.emptyList : undefined,
            { paddingBottom: listPaddingBottom },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
  rowDisabled: { opacity: 0.55 },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  avatarPh: { backgroundColor: '#e8dff9', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontWeight: '900', color: PURPLE, fontSize: 18 },
  rowBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '800', color: '#111' },
  preview: { fontSize: 13, color: '#666', marginTop: 4 },
  typing: { color: PURPLE, fontWeight: '700' },
});
