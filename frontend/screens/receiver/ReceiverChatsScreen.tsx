import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
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

import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { chatApi, getErrorMessage } from '../../services/api';
import type { ChatPeerSummary } from '../../types/api';

type Props = NativeStackScreenProps<ReceiverStackParamList, 'ReceiverChats'>;

const PURPLE = '#7b2cff';

export default function ReceiverChatsScreen({ navigation }: Props): React.JSX.Element {
  const [rows, setRows] = useState<ChatPeerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const { data } = await chatApi.conversations();
      setRows(data.conversations);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = (): void => {
    setRefreshing(true);
    void load();
  };

  const renderItem = ({ item }: { item: ChatPeerSummary }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() =>
        navigation.navigate('ReceiverChat', {
          userId: item.peerId,
          userName: item.peerName,
          userImage: item.peerImage,
        })
      }
    >
      {item.peerImage ? (
        <Image source={{ uri: item.peerImage }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPh]}>
          <Text style={styles.avatarTxt}>{item.peerName.charAt(0) ?? '?'}</Text>
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={styles.name} numberOfLines={1}>
          {item.peerName}
        </Text>
        <Text style={styles.preview} numberOfLines={1}>
          {item.lastText}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={{ width: 40 }} />
      </View>

      {error ? <Text style={styles.errBanner}>{error}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={PURPLE} />
        </View>
      ) : (
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
});
