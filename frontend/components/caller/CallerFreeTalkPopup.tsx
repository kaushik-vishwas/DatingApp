import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CALLER_FREE_TALK_MINUTES } from '../../utils/callerFreeTalkPopupStorage';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onRandomCall: () => void;
  randomCallBusy?: boolean;
};

export default function CallerFreeTalkPopup({
  visible,
  onDismiss,
  onRandomCall,
  randomCallBusy = false,
}: Props): React.JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <TouchableOpacity
            onPress={onDismiss}
            hitSlop={12}
            style={styles.closeBtn}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color="#94a3b8" />
          </TouchableOpacity>

          <View style={styles.badge}>
            <Ionicons name="gift" size={18} color="#fff" />
            <Text style={styles.badgeText}>Welcome gift</Text>
          </View>

          <Text style={styles.headline}>
            You got {CALLER_FREE_TALK_MINUTES} min free talk time!
          </Text>
          <Text style={styles.body}>
            Start a Random Call now and enjoy your free minutes. This offer reminder appears about
            once every hour.
          </Text>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onRandomCall}
            disabled={randomCallBusy}
            style={styles.ctaHit}
          >
            <LinearGradient
              colors={['#f472b6', '#a855f7', '#db2777']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.cta, randomCallBusy && styles.ctaDisabled]}
            >
              <Text style={styles.ctaText}>
                {randomCallBusy ? 'Please wait…' : 'Random Call'}
              </Text>
              {!randomCallBusy ? <Ionicons name="call-outline" size={18} color="#fff" /> : null}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={onDismiss} style={styles.dismissWrap} activeOpacity={0.85}>
            <Text style={styles.dismiss}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: {
    backgroundColor: '#0b1220',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
  },
  closeBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    zIndex: 2,
    padding: 4,
  },
  badge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#db2777',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
    marginTop: 8,
  },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  headline: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 28,
  },
  body: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  ctaHit: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  cta: {
    minHeight: 50,
    borderRadius: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaDisabled: { opacity: 0.75 },
  ctaText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  dismissWrap: { alignItems: 'center', marginTop: 14 },
  dismiss: { color: '#94a3b8', fontWeight: '700', fontSize: 13 },
});
