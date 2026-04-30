import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { io, type Socket } from 'socket.io-client';

import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import {
  chatApi,
  CHAT_REPORT_REASONS,
  type ChatReportReason,
  getJwt,
  getResolvedApiBaseUrl,
} from '../../services/api';
import type { ChatMessageDto } from '../../types/api';
import { useAuth } from '../../context/AuthContext';
import { useCallSignals } from '../../context/CallSignalContext';
import { useChatInbox } from '../../context/ChatInboxContext';

const PURPLE = '#7b2cff';
const CHAT_FEE_LABEL = '₹0.50';

type Props =
  | NativeStackScreenProps<CallerStackParamList, 'CallerChat'>
  | NativeStackScreenProps<ReceiverStackParamList, 'ReceiverChat'>;

type WalletSocketPayload = {
  callerWallet: number;
  receiverWallet: number;
};

type ChatSendAck = {
  ok?: boolean;
  error?: string;
  code?: string;
  walletBalance?: number;
  requiredInr?: number;
};

type ChatTypingEvent = {
  peerId: string;
  fromType: 'u' | 'r';
  fromId: string;
  typing: boolean;
};

export default function ChatConversationScreen({ navigation, route }: Props): React.JSX.Element {
  const { user, refreshUser } = useAuth();
  const { registerPeer, startCallInvite } = useCallSignals();
  const { markPeerReadLocal, setActivePeer } = useChatInbox();
  const callerNav = useNavigation<NativeStackNavigationProp<CallerStackParamList>>();
  const receiverNav = useNavigation<NativeStackNavigationProp<ReceiverStackParamList>>();
  const isCaller = route.name === 'CallerChat';
  const peerId = isCaller ? route.params.receiverId : route.params.userId;
  const peerName = isCaller ? route.params.receiverName : route.params.userName;
  const peerImage = isCaller
    ? route.params.receiverImage ?? null
    : route.params.userImage ?? null;

  const mySenderType = user?.role === 'caller' ? 'u' : 'r';

  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [calling, setCalling] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [thanksOpen, setThanksOpen] = useState(false);
  const [continueOpen, setContinueOpen] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [reportReason, setReportReason] = useState<ChatReportReason>('Spam');
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<FlatList<ChatMessageDto>>(null);
  const typingStatusRef = useRef(false);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markReadOnServer = useCallback(async () => {
    try {
      if (isCaller) {
        await chatApi.markRead({ receiverId: peerId });
      } else {
        await chatApi.markRead({ userId: peerId });
      }
    } catch {
      // Ignore transient read-sync failures.
    }
  }, [isCaller, peerId]);

  const emitTyping = useCallback((typing: boolean) => {
    const s = socketRef.current;
    if (!s?.connected) return;
    if (typingStatusRef.current === typing) return;
    typingStatusRef.current = typing;
    s.emit('chat:typing', { typing });
  }, []);

  const appendMessage = useCallback((m: ChatMessageDto) => {
    setMessages((prev) => {
      if (prev.some((x) => x.id === m.id)) return prev;
      return [...prev, m];
    });
  }, []);

  useEffect(() => {
    registerPeer(peerId, peerName, peerImage);
  }, [peerId, peerName, peerImage, registerPeer]);

  useEffect(() => {
    setActivePeer(peerId);
    markPeerReadLocal(peerId);
    void markReadOnServer();
    return () => {
      setActivePeer(null);
    };
  }, [markPeerReadLocal, markReadOnServer, peerId, setActivePeer]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const { data } = isCaller
          ? await chatApi.messages({ receiverId: peerId })
          : await chatApi.messages({ userId: peerId });
        if (!cancelled) {
          setMessages(data.messages);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const status = (e as { response?: { status?: number } })?.response?.status;
          if (status === 403) {
            setLoadError('This conversation is blocked or unavailable.');
          } else {
            setLoadError('Could not load messages.');
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCaller, peerId]);

  useEffect(() => {
    let cancelled = false;
    const base = getResolvedApiBaseUrl();

    void (async () => {
      const token = await getJwt();
      if (!token || cancelled) return;

      const socket = io(base, {
        auth: { token },
        transports: ['polling', 'websocket'],
        timeout: 20000,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      if (cancelled) {
        socket.removeAllListeners();
        socket.disconnect();
        return;
      }

      socketRef.current = socket;

      socket.on('connect_error', (err) => {
        setSocketError(err.message || 'Could not connect to chat.');
      });

      socket.on('disconnect', (reason) => {
        if (reason !== 'io client disconnect') {
          setSocketError('Chat disconnected. Reconnecting...');
        }
      });

      socket.on('chat:wallet', (_payload: WalletSocketPayload) => {
        void refreshUser();
      });

      socket.on('connect', () => {
        setSocketError(null);
        socket.emit(
          'chat:join',
          isCaller ? { receiverId: peerId } : { userId: peerId },
          (res: { ok?: boolean; error?: string }) => {
            if (res && res.ok === false && res.error) {
              setSocketError(res.error);
            }
          }
        );
      });

      socket.on('chat:newMessage', (msg: ChatMessageDto) => {
        appendMessage(msg);
        if (msg.senderType !== mySenderType) {
          markPeerReadLocal(peerId);
          void markReadOnServer();
        }
      });

      socket.on('chat:typing', (payload: ChatTypingEvent) => {
        if (payload.fromType === mySenderType) return;
        setPeerTyping(Boolean(payload.typing));
      });

      socket.on('call:response', () => setCalling(false));
      socket.on('call:ended', () => setCalling(false));
    })();

    return () => {
      cancelled = true;
      const s = socketRef.current;
      if (s) {
        s.emit('chat:leave');
        s.removeAllListeners();
        s.disconnect();
        socketRef.current = null;
      }
    };
  }, [appendMessage, isCaller, markPeerReadLocal, markReadOnServer, mySenderType, peerId, refreshUser]);

  const closeMenu = (): void => setMenuOpen(false);

  const onBlock = (): void => {
    closeMenu();
    Alert.alert('Block user?', 'You will not be able to message each other anymore.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await chatApi.block(isCaller ? { receiverId: peerId } : { userId: peerId });
              Alert.alert('Blocked', 'This chat is now blocked.', [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            } catch {
              Alert.alert('Error', 'Could not block. Try again.');
            }
          })();
        },
      },
    ]);
  };

  const onClearChat = (): void => {
    closeMenu();
    Alert.alert('Clear chat?', 'All messages in this conversation will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              const { data } = await chatApi.clear(
                isCaller ? { receiverId: peerId } : { userId: peerId }
              );
              setMessages([]);
              Alert.alert('Cleared', data.deletedCount ? `${data.deletedCount} messages removed.` : 'Done.');
            } catch {
              Alert.alert('Error', 'Could not clear chat.');
            }
          })();
        },
      },
    ]);
  };

  const submitReport = (): void => {
    void (async () => {
      try {
        await chatApi.report({
          reason: reportReason,
          preview: '',
          ...(isCaller ? { receiverId: peerId } : { userId: peerId }),
        });
        setReportOpen(false);
        setThanksOpen(true);
      } catch {
        Alert.alert('Error', 'Could not submit report.');
      }
    })();
  };

  const onSend = (): void => {
    const text = input.trim();
    if (!text || sending) return;
    const s = socketRef.current;
    if (!s?.connected) {
      setSocketError('Not connected. Check your network.');
      return;
    }
    setSending(true);
    emitTyping(false);
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    s.emit('chat:message', { text }, (res: ChatSendAck) => {
      setSending(false);
      if (res && res.ok === false) {
        if (res.code === 'INSUFFICIENT_WALLET' && isCaller) {
          setContinueOpen(true);
          setSocketError(null);
          return;
        }
        setSocketError(res.error || 'Send failed');
        return;
      }
      setInput('');
    });
  };

  const onChangeInput = (value: string): void => {
    setInput(value);
    const typing = value.trim().length > 0;
    emitTyping(typing);
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (typing) {
      typingStopTimerRef.current = setTimeout(() => {
        emitTyping(false);
      }, 1200);
    }
  };

  useEffect(() => {
    return () => {
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      emitTyping(false);
    };
  }, [emitTyping]);

  const goWallet = (): void => {
    setContinueOpen(false);
    if (isCaller) {
      callerNav.navigate('Wallet');
    }
  };

  const onStartVoiceCall = (): void => {
    if (calling) return;
    if (!socketRef.current?.connected) {
      setSocketError('Chat is reconnecting. Please try again in a moment.');
      return;
    }
    setCalling(true);
    if (isCaller) {
      void (async () => {
        try {
          await startCallInvite(peerId, peerName, peerImage);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Could not start call right now.';
          Alert.alert('Call failed', msg);
        } finally {
          setCalling(false);
        }
      })();
    } else {
      receiverNav.navigate('ReceiverQueue', { peerId, peerName, peerImage });
      setCalling(false);
    }
  };

  const renderItem = ({ item }: { item: ChatMessageDto }) => {
    const mine = item.senderType === mySenderType;
    return (
      <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backTxt}>←</Text>
          </TouchableOpacity>
          {peerImage ? (
            <Image source={{ uri: peerImage }} style={styles.peerAv} />
          ) : (
            <View style={[styles.peerAv, styles.peerAvPh]}>
              <Text style={styles.peerAvTxt}>{peerName.charAt(0) ?? '?'}</Text>
            </View>
          )}
          <Text style={styles.title} numberOfLines={1}>
            {peerName}
          </Text>
          {peerTyping ? <Text style={styles.typingText}>typing...</Text> : null}
          <TouchableOpacity
            onPress={onStartVoiceCall}
            style={[styles.callBtnTop, calling && styles.callBtnTopOff]}
            disabled={calling}
          >
            <Text style={styles.callBtnTopTxt}>{calling ? 'Calling…' : 'Call'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMenuOpen((v) => !v)}
            style={styles.moreBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.moreDots}>⋮</Text>
          </TouchableOpacity>
        </View>

        {menuOpen ? (
          <Pressable style={styles.menuBackdrop} onPress={closeMenu}>
            <View style={styles.menuCard}>
              <TouchableOpacity onPress={onBlock} style={styles.menuItem}>
                <Text style={styles.menuBlock}>Block user</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  closeMenu();
                  setReportOpen(true);
                }}
                style={styles.menuItem}
              >
                <Text style={styles.menuPlain}>Report user</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClearChat} style={styles.menuItem}>
                <Text style={styles.menuPlain}>Clear chat</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        ) : null}

        {loadError ? <Text style={styles.bannerErr}>{loadError}</Text> : null}
        {socketError ? <Text style={styles.bannerErr}>{socketError}</Text> : null}

        {loading ? (
          <View style={styles.centerFill}>
            <ActivityIndicator size="large" color={PURPLE} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={onChangeInput}
            placeholder="Type a message…"
            placeholderTextColor="#999"
            multiline
            maxLength={2000}
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnOff]}
            onPress={onSend}
            disabled={!input.trim() || sending}
          >
            <Text style={styles.sendTxt}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={continueOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.continueCard}>
            <Text style={styles.continueTitle}>Continue to chat !</Text>
            <Text style={styles.coinEmoji}>🪙</Text>
            <Text style={styles.continueSub}>Just for {CHAT_FEE_LABEL} (50 paise) per message</Text>
            <Text style={styles.continueHint}>
              After the receiver replies once, each message you send uses {CHAT_FEE_LABEL} from your wallet and
              credits the receiver.
            </Text>
            {isCaller ? (
              <TouchableOpacity style={styles.continueBtn} onPress={goWallet}>
                <Text style={styles.continueBtnTxt}>Continue to Chat !</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.continueBtn} onPress={() => setContinueOpen(false)}>
                <Text style={styles.continueBtnTxt}>OK</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.modalCloseGhost} onPress={() => setContinueOpen(false)}>
              <Text style={styles.modalCloseGhostTxt}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={reportOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.reportCard}>
            <View style={styles.reportHeader}>
              <Text style={styles.reportTitle}>Report User</Text>
              <TouchableOpacity onPress={() => setReportOpen(false)} hitSlop={12}>
                <Text style={styles.reportClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.reportQ}>Why are you reporting this user?</Text>
            <ScrollView style={styles.reasonList} keyboardShouldPersistTaps="handled">
              {CHAT_REPORT_REASONS.map((r) => {
                const selected = reportReason === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.reasonRow, selected && styles.reasonRowOn]}
                    onPress={() => setReportReason(r)}
                  >
                    <Text style={[styles.reasonTxt, selected && styles.reasonTxtOn]}>{r}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.submitReportBtn} onPress={submitReport}>
              <Text style={styles.submitReportTxt}>Submit Report</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={thanksOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.thanksCard}>
            <Text style={styles.thanksTitle}>Thanks !</Text>
            <Text style={styles.thanksEmoji}>📋</Text>
            <Text style={styles.thanksSub}>for Reporting !</Text>
            <TouchableOpacity
              style={styles.thanksBtn}
              onPress={() => {
                setThanksOpen(false);
              }}
            >
              <Text style={styles.thanksBtnTxt}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7' },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
    backgroundColor: '#fff',
    zIndex: 2,
  },
  backBtn: { padding: 8 },
  backTxt: { fontSize: 22, color: '#111' },
  peerAv: { width: 36, height: 36, borderRadius: 18 },
  peerAvPh: { backgroundColor: '#e8dff9', alignItems: 'center', justifyContent: 'center' },
  peerAvTxt: { fontWeight: '900', color: PURPLE, fontSize: 14 },
  title: { flex: 1, fontSize: 17, fontWeight: '900', color: '#111' },
  typingText: { fontSize: 11, color: PURPLE, fontWeight: '700' },
  callBtnTop: {
    backgroundColor: PURPLE,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
  },
  callBtnTopOff: { opacity: 0.7 },
  callBtnTopTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
  moreBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  moreDots: { fontSize: 22, color: '#333', fontWeight: '900' },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    zIndex: 5,
    paddingTop: 52,
    alignItems: 'flex-end',
    paddingRight: 10,
  },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    minWidth: 180,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  menuItem: { paddingVertical: 12, paddingHorizontal: 16 },
  menuBlock: { color: '#dc2626', fontSize: 16, fontWeight: '700' },
  menuPlain: { color: '#111', fontSize: 16, fontWeight: '600' },
  bannerErr: {
    marginHorizontal: 12,
    marginTop: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '600',
  },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 12, paddingVertical: 12, flexGrow: 1 },
  bubbleRow: { marginBottom: 8, maxWidth: '100%' },
  bubbleRowMine: { alignItems: 'flex-end' },
  bubbleRowTheirs: { alignItems: 'flex-start' },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  bubbleMine: { backgroundColor: PURPLE },
  bubbleTheirs: { backgroundColor: '#e8e8ea' },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },
  bubbleTextTheirs: { color: '#111' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  sendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: PURPLE,
  },
  sendBtnOff: { opacity: 0.45 },
  sendTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  continueCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  continueTitle: { fontSize: 22, fontWeight: '900', color: '#111', marginBottom: 8 },
  coinEmoji: { fontSize: 48, marginVertical: 8 },
  continueSub: { fontSize: 16, fontWeight: '700', color: PURPLE, textAlign: 'center' },
  continueHint: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },
  continueBtn: {
    marginTop: 20,
    backgroundColor: PURPLE,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
  },
  continueBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
  modalCloseGhost: { marginTop: 12, padding: 8 },
  modalCloseGhostTxt: { color: '#666', fontWeight: '600', fontSize: 14 },
  reportCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '88%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  reportTitle: { fontSize: 20, fontWeight: '900', color: '#111' },
  reportClose: { fontSize: 20, color: '#666', padding: 4 },
  reportQ: { fontSize: 15, color: '#444', marginBottom: 12, fontWeight: '600' },
  reasonList: { maxHeight: 280 },
  reasonRow: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  reasonRowOn: { borderColor: PURPLE, backgroundColor: '#f5f0ff' },
  reasonTxt: { fontSize: 15, color: '#111' },
  reasonTxtOn: { fontWeight: '800', color: PURPLE },
  submitReportBtn: {
    marginTop: 8,
    backgroundColor: PURPLE,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitReportTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
  thanksCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
  },
  thanksTitle: { fontSize: 24, fontWeight: '900', color: '#111' },
  thanksEmoji: { fontSize: 56, marginVertical: 12 },
  thanksSub: { fontSize: 16, color: '#444', fontWeight: '600', marginBottom: 20 },
  thanksBtn: {
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
  },
  thanksBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
