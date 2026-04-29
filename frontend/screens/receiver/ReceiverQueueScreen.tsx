import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { useAuth } from '../../context/AuthContext';
import { useCallSignals, type IncomingCallRequest } from '../../context/CallSignalContext';
import { getErrorMessage, profileApi } from '../../services/api';
import type { ReceiverNotifyCandidateRow } from '../../types/api';

type Props = NativeStackScreenProps<ReceiverStackParamList, 'ReceiverQueue'>;
const QUEUE_WAIT_MS = 60_000;
const RETRY_DELAY_MS = 3_000;
const WAITING_HINTS = ['Somebody will join soon.', 'Be polite on call.', 'Have patience.'];
const DEFAULT_CALLER_NAME = 'Caller';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function ReceiverQueueScreen({ navigation, route }: Props): React.JSX.Element {
  const { user } = useAuth();
  const { setIncomingCallHandler, acceptIncomingCall, setQueueMode, startCallInvite } = useCallSignals();
  const isFocused = useIsFocused();
  const [incoming, setIncoming] = useState<IncomingCallRequest | null>(null);
  const [joining, setJoining] = useState(false);
  const [calling, setCalling] = useState(false);
  const [waitLeftSec, setWaitLeftSec] = useState(Math.round(QUEUE_WAIT_MS / 1000));
  const [bluetoothMic, setBluetoothMic] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hintIdx, setHintIdx] = useState(0);
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [notifyRows, setNotifyRows] = useState<ReceiverNotifyCandidateRow[]>([]);
  const [notifyingUserId, setNotifyingUserId] = useState<string | null>(null);
  const queueStoppedRef = useRef(false);
  const peerId = route.params?.peerId ?? null;
  const peerName = route.params?.peerName ?? DEFAULT_CALLER_NAME;
  const [queuedPeerName, setQueuedPeerName] = useState(peerId ? peerName : DEFAULT_CALLER_NAME);
  const [queuedPeerImage, setQueuedPeerImage] = useState<string | null>(null);

  const selfName = useMemo(() => {
    const raw = user?.name?.trim();
    return raw && raw.length > 0 ? raw : 'You';
  }, [user?.name]);

  const selfInitial = useMemo(() => selfName.charAt(0).toUpperCase(), [selfName]);
  const shownPeerName = incoming?.peerName ?? queuedPeerName;
  const shownPeerImage = incoming?.peerImage ?? queuedPeerImage;
  const peerInitial = useMemo(() => (shownPeerName.charAt(0) || '?').toUpperCase(), [shownPeerName]);

  const exitQueue = useCallback(
    (mode: 'back' | 'home') => {
      queueStoppedRef.current = true;
      setIncoming(null);
      setQueuedPeerName(DEFAULT_CALLER_NAME);
      setQueuedPeerImage(null);
      void (async () => {
        try {
          await setQueueMode(false);
        } catch {
          // ignore
        } finally {
          if (mode === 'back') {
            navigation.goBack();
          } else {
            navigation.navigate('ReceiverHome');
          }
        }
      })();
    },
    [navigation, setQueueMode]
  );

  useEffect(() => {
    const id = setInterval(() => {
      setHintIdx((prev) => (prev + 1) % WAITING_HINTS.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    let mounted = true;
    queueStoppedRef.current = false;
    void setQueueMode(true).catch(() => {});
    setIncomingCallHandler((req) => {
      setIncoming(req);
      setJoining(true);
      void (async () => {
        try {
          await acceptIncomingCall(req);
        } catch (e: unknown) {
          if (mounted) {
            setJoining(false);
            setIncoming(null);
            setQueuedPeerName(DEFAULT_CALLER_NAME);
            setQueuedPeerImage(null);
          }
        }
      })();
    });
    return () => {
      mounted = false;
      queueStoppedRef.current = true;
      setIncomingCallHandler(null);
      void setQueueMode(false).catch(() => {});
    };
  }, [acceptIncomingCall, isFocused, setIncomingCallHandler, setQueueMode]);

  useEffect(() => {
    if (!isFocused || !peerId) return;
    setCalling(true);
    void (async () => {
      const startedAt = Date.now();
      while (!queueStoppedRef.current && Date.now() - startedAt < QUEUE_WAIT_MS) {
        try {
          setQueuedPeerName(peerName);
          setQueuedPeerImage(route.params?.peerImage ?? null);
          await startCallInvite(peerId, peerName, route.params?.peerImage ?? null);
          if (queueStoppedRef.current) return;
          return;
        } catch (e: unknown) {
          if (queueStoppedRef.current) return;
          const msg = getErrorMessage(e).toLowerCase();
          const retriable =
            msg.includes('waiting queue') ||
            msg.includes('not available in queue right now') ||
            msg.includes('not available right now');
          if (!retriable) {
            if (queueStoppedRef.current) return;
            Alert.alert('Call failed', getErrorMessage(e));
            navigation.goBack();
            return;
          }
          setQueuedPeerName(DEFAULT_CALLER_NAME);
          setQueuedPeerImage(null);
          setIncoming(null);
          const elapsed = Date.now() - startedAt;
          const left = Math.max(0, Math.ceil((QUEUE_WAIT_MS - elapsed) / 1000));
          setWaitLeftSec(left);
          await sleep(RETRY_DELAY_MS);
        }
      }
      if (queueStoppedRef.current) return;
      Alert.alert('Call unavailable', 'No caller found. Try again after some time.');
      navigation.goBack();
    })()
      .finally(() => {
        setCalling(false);
      });
  }, [isFocused, navigation, peerId, peerName, route.params?.peerImage, startCallInvite]);

  useEffect(() => {
    if (!isFocused || peerId) return;
    setCalling(true);
    const timeout = setTimeout(() => {
      if (queueStoppedRef.current) return;
      Alert.alert('Call unavailable', 'No caller found. Try again after some time.');
      navigation.goBack();
    }, QUEUE_WAIT_MS);
    const tick = setInterval(() => {
      setWaitLeftSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(tick);
    };
  }, [isFocused, navigation, peerId]);

  const goOffline = () => {
    setMenuOpen(false);
    exitQueue('home');
  };

  const openNotifyUsers = () => {
    setMenuOpen(false);
    if (!user?.isOnline || !user?.isAvailable) {
      Alert.alert('Unavailable', 'You can notify users only when online and available.');
      return;
    }
    setNotifyModalOpen(true);
    setNotifyLoading(true);
    setNotifyError(null);
    void (async () => {
      try {
        const { data } = await profileApi.receiverNotifyCandidates();
        setNotifyRows(data.users ?? []);
      } catch (e: unknown) {
        setNotifyError(getErrorMessage(e));
      } finally {
        setNotifyLoading(false);
      }
    })();
  };

  const notifyUser = (row: ReceiverNotifyCandidateRow) => {
    if (notifyingUserId) return;
    setNotifyingUserId(row.userId);
    void (async () => {
      try {
        const { data } = await profileApi.notifyReceiverUser(row.userId);
        Alert.alert('Notification sent', data.message || 'User notified successfully.');
      } catch (e: unknown) {
        Alert.alert('Notify failed', getErrorMessage(e));
      } finally {
        setNotifyingUserId(null);
      }
    })();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => exitQueue('back')}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Go Online</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => setMenuOpen(true)}>
            <Text style={styles.menuDots}>⋯</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>
          {incoming || joining
            ? 'Connecting call...'
            : calling
              ? `Waiting for ${shownPeerName}...`
              : 'Waiting for caller...'}
        </Text>
        <Text style={styles.subtitle}>
          {incoming || joining
            ? `${incoming?.peerName ?? 'Caller'} is connecting. Auto-joining now...`
            : calling
              ? `Waiting up to 1 minute (${waitLeftSec}s left).`
              : 'Stay on this screen. Somebody will join soon.'}
        </Text>
        {!incoming && !joining ? <Text style={styles.hint}>{WAITING_HINTS[hintIdx]}</Text> : null}

        {!incoming && <ActivityIndicator size="small" color="#22c55e" style={styles.waitingSpinner} />}

        <View style={styles.avatarRow}>
          <View style={styles.avatarWrap}>
            {user?.profileImage ? (
              <Image source={{ uri: user.profileImage }} style={styles.avatar} />
            ) : (
              <View style={styles.placeholder}>
                <Text style={styles.initial}>{selfInitial}</Text>
              </View>
            )}
            <Text style={styles.avatarName}>{selfName}</Text>
          </View>

          <View style={styles.avatarWrap}>
            {shownPeerImage ? (
              <Image source={{ uri: shownPeerImage }} style={styles.avatar} />
            ) : (
              <View style={styles.placeholder}>
                <Text style={styles.initial}>{peerInitial}</Text>
              </View>
            )}
            <Text style={styles.avatarName}>{shownPeerName}</Text>
          </View>
        </View>

        <View style={styles.audioOptions}>
          <View style={styles.audioRow}>
            <Text style={styles.audioLabel}>Bluetooth Mic</Text>
            <TouchableOpacity
              style={[styles.pill, bluetoothMic && styles.pillActive]}
              onPress={() => setBluetoothMic((s) => !s)}
            >
              <Text style={[styles.pillText, bluetoothMic && styles.pillTextActive]}>
                {bluetoothMic ? 'On' : 'Off'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.audioRow}>
            <Text style={styles.audioLabel}>Speaker</Text>
            <TouchableOpacity
              style={[styles.pill, speakerOn && styles.pillActive]}
              onPress={() => setSpeakerOn((s) => !s)}
            >
              <Text style={[styles.pillText, speakerOn && styles.pillTextActive]}>
                {speakerOn ? 'On' : 'Off'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {joining ? <Text style={styles.joiningText}>Joining call...</Text> : null}
      </View>
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuCard} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity style={styles.menuItem} onPress={openNotifyUsers}>
              <Text style={styles.menuItemText}>Notify Users</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={goOffline}>
              <Text style={styles.menuItemText}>Go Offline</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={notifyModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setNotifyModalOpen(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setNotifyModalOpen(false)}>
          <Pressable style={styles.sheetCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Notify Users</Text>
            <Text style={styles.sheetSub}>Latest 20 users from your recent calls</Text>
            {notifyLoading ? (
              <ActivityIndicator color="#7b2cff" style={{ marginTop: 14 }} />
            ) : notifyError ? (
              <Text style={styles.sheetErr}>{notifyError}</Text>
            ) : notifyRows.length === 0 ? (
              <Text style={styles.sheetEmpty}>No recent users to notify.</Text>
            ) : (
              <ScrollView style={styles.sheetList} contentContainerStyle={{ paddingBottom: 12 }}>
                {notifyRows.map((row) => (
                  <View key={row.userId} style={styles.sheetRow}>
                    <View style={styles.sheetLeft}>
                      {row.profileImage ? (
                        <Image source={{ uri: row.profileImage }} style={styles.sheetAvatar} />
                      ) : (
                        <View style={[styles.sheetAvatar, styles.sheetAvatarPh]}>
                          <Text style={styles.sheetAvatarTxt}>{row.name.charAt(0) || '?'}</Text>
                        </View>
                      )}
                      <View>
                        <Text style={styles.sheetName}>{row.name}</Text>
                        <Text style={styles.sheetAt}>
                          Last call {new Date(row.lastCallAt).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.bellBtn}
                      disabled={notifyingUserId === row.userId}
                      onPress={() => notifyUser(row)}
                    >
                      <Text style={styles.bellTxt}>
                        {notifyingUserId === row.userId ? '…' : '🔔'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0b1120',
  },
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: '#cbd5e1',
    fontSize: 22,
    fontWeight: '700',
    marginTop: -2,
  },
  menuDots: {
    color: '#cbd5e1',
    fontSize: 22,
    fontWeight: '800',
    marginTop: -8,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  title: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 12,
  },
  subtitle: {
    color: '#94a3b8',
    textAlign: 'center',
    fontSize: 14,
    marginTop: 10,
    lineHeight: 20,
  },
  hint: {
    color: '#cbd5e1',
    textAlign: 'center',
    fontSize: 13,
    marginTop: 8,
    fontWeight: '600',
  },
  waitingSpinner: {
    marginTop: 12,
  },
  avatarRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 30,
  },
  avatarWrap: {
    alignItems: 'center',
    width: 132,
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 4,
    borderColor: '#22c55e',
  },
  placeholder: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 4,
    borderColor: '#22c55e',
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: '#f8fafc',
    fontSize: 34,
    fontWeight: '800',
  },
  avatarName: {
    marginTop: 10,
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  audioOptions: {
    marginTop: 34,
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    gap: 10,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  audioLabel: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
  },
  pill: {
    minWidth: 60,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    alignItems: 'center',
  },
  pillActive: {
    borderColor: '#22c55e',
    backgroundColor: '#052e16',
  },
  pillText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  pillTextActive: {
    color: '#86efac',
  },
  joiningText: {
    marginTop: 20,
    color: '#86efac',
    textAlign: 'center',
    fontWeight: '700',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 78,
    paddingRight: 16,
  },
  menuCard: {
    width: 170,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
  },
  menuItem: { paddingHorizontal: 14, paddingVertical: 12 },
  menuItemText: { color: '#e2e8f0', fontSize: 14, fontWeight: '700' },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 14,
    maxHeight: '74%',
  },
  sheetTitle: { fontSize: 16, fontWeight: '900', color: '#111' },
  sheetSub: { fontSize: 12, color: '#666', marginTop: 4, marginBottom: 10 },
  sheetErr: { color: '#b91c1c', fontSize: 12, fontWeight: '700', marginTop: 8 },
  sheetEmpty: { color: '#666', fontSize: 12, marginTop: 8 },
  sheetList: { marginTop: 6 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  sheetLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  sheetAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#f1f5f9' },
  sheetAvatarPh: { alignItems: 'center', justifyContent: 'center' },
  sheetAvatarTxt: { color: '#7b2cff', fontSize: 14, fontWeight: '800' },
  sheetName: { color: '#111', fontSize: 13, fontWeight: '800' },
  sheetAt: { color: '#666', fontSize: 11, marginTop: 2 },
  bellBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellTxt: { fontSize: 16 },
});
