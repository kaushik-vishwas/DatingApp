import React from 'react';
import {
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

const SUPPORT_EMAIL = 'support@selecto.com';
const PURPLE = '#7b2cff';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Optional message from the server; falls back to a default when omitted. */
  message?: string;
};

/**
 * Friendly popup shown when a receiver/caller whose account was paused by
 * admin (rejected/terminated) tries to log in. Offers Help (opens an email
 * to support@selecto.com) or Cancel (just dismisses).
 */
export function AccountPausedModal({ visible, onClose, message }: Props) {
  const handleHelp = () => {
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => undefined);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Icon name="pause-circle" size={38} color={PURPLE} />
          </View>

          <Text style={styles.title}>Account Access Paused</Text>

          <Text style={styles.body}>
            {message?.trim() || 'Your account access is paused. Contact support if you need help.'}
          </Text>

          <TouchableOpacity
            style={styles.helpButton}
            onPress={handleHelp}
            activeOpacity={0.85}
          >
            <Icon name="mail-outline" size={18} color="#fff" />
            <Text style={styles.helpButtonText}>Help</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#f3e8ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
  },
  body: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: '#555',
    textAlign: 'center',
  },
  helpButton: {
    marginTop: 22,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PURPLE,
    borderRadius: 12,
    paddingVertical: 14,
  },
  helpButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  cancelButton: {
    marginTop: 10,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#f2f2f7',
  },
  cancelButtonText: {
    color: '#444',
    fontSize: 15,
    fontWeight: '700',
  },
});