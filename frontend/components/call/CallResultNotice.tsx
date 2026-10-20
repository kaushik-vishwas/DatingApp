import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export type CallResultKind = 'no_answer' | 'declined' | 'connect_failed';

type Props = {
  visible: boolean;
  kind: CallResultKind | null;
  peerName: string;
  message?: string;
  onClose: () => void;
};

export default function CallResultNotice({
  visible,
  kind,
  peerName,
  message,
  onClose,
}: Props): React.JSX.Element {
  const connectFailed = kind === 'connect_failed';
  const noAnswer = kind !== 'declined' && !connectFailed;
  const name = peerName.trim() || 'They';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View
            style={[
              styles.iconWrap,
              noAnswer || connectFailed ? styles.iconWait : styles.iconDeclined,
            ]}
          >
            <Ionicons
              name={connectFailed ? 'cloud-offline-outline' : noAnswer ? 'time-outline' : 'call-outline'}
              size={28}
              color={noAnswer || connectFailed ? '#6d28d9' : '#9d174d'}
            />
          </View>
          <Text style={styles.title}>
            {connectFailed ? 'Voice call error' : noAnswer ? 'No answer' : 'Call declined'}
          </Text>
          <Text style={styles.body}>
            {connectFailed
              ? message
              : noAnswer
                ? `${name} didn't pick up.`
                : `The call with ${name} was declined.`}
          </Text>
          <Pressable style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>OK</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 0, 20, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 20,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  iconWait: { backgroundColor: '#f3e8ff' },
  iconDeclined: { backgroundColor: '#fce7f3' },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1025',
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#5b5366',
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    alignSelf: 'stretch',
    backgroundColor: '#6d28d9',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
