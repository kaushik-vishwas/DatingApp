import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { resolveProfileImageSource } from '../../utils/avatarSource';

const PURPLE = '#7b2cff';
const RANDOM_MATCH_RING_EXPAND_MS = 2400;
const RANDOM_MATCH_RING_CYCLE_MS =
  RANDOM_MATCH_RING_EXPAND_MS + 2 * (RANDOM_MATCH_RING_EXPAND_MS / 3);

type Props = {
  visible: boolean;
  onCancel: () => void;
  userName?: string | null;
  userProfileImage?: string | null;
};

export default function RandomCallMatchingOverlay({
  visible,
  onCancel,
  userName,
  userProfileImage,
}: Props): React.JSX.Element {
  const randomRingPulse0 = useRef(new Animated.Value(0)).current;
  const randomRingPulse1 = useRef(new Animated.Value(0)).current;
  const randomRingPulse2 = useRef(new Animated.Value(0)).current;
  const avatarSource = resolveProfileImageSource(userProfileImage);

  useEffect(() => {
    const rings = [randomRingPulse0, randomRingPulse1, randomRingPulse2];
    if (!visible) {
      rings.forEach((r) => {
        r.stopAnimation();
        r.setValue(0);
      });
      return;
    }
    const loops = rings.map((ring, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * (RANDOM_MATCH_RING_EXPAND_MS / 3)),
          Animated.timing(ring, {
            toValue: 1,
            duration: RANDOM_MATCH_RING_EXPAND_MS,
            useNativeDriver: true,
          }),
          Animated.timing(ring, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        { iterations: -1 }
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [visible, randomRingPulse0, randomRingPulse1, randomRingPulse2]);

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.matchOverlay}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.85}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>

        <View style={styles.matchWaveArea}>
          <View style={styles.matchRippleHub}>
            <Animated.View
              style={[
                styles.matchRippleCircle,
                {
                  opacity: randomRingPulse0.interpolate({
                    inputRange: [0, 0.1, 0.5, 1],
                    outputRange: [0, 0.55, 0.2, 0],
                  }),
                  transform: [
                    {
                      scale: randomRingPulse0.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.42, 3.95],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.matchRippleCircle,
                {
                  opacity: randomRingPulse1.interpolate({
                    inputRange: [0, 0.1, 0.5, 1],
                    outputRange: [0, 0.55, 0.2, 0],
                  }),
                  transform: [
                    {
                      scale: randomRingPulse1.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.42, 3.95],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.matchRippleCircle,
                {
                  opacity: randomRingPulse2.interpolate({
                    inputRange: [0, 0.1, 0.5, 1],
                    outputRange: [0, 0.55, 0.2, 0],
                  }),
                  transform: [
                    {
                      scale: randomRingPulse2.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.42, 3.95],
                      }),
                    },
                  ],
                },
              ]}
            />
            <View style={styles.matchRippleCore} />
          </View>
          <Text style={styles.matchTitle}>Connecting you…</Text>
          <Text style={styles.matchSub}>Hang tight while we pair you with someone.</Text>
        </View>

        <View style={styles.matchCallerRow}>
          {avatarSource ? (
            <Image source={avatarSource} style={styles.matchCallerAvatar} />
          ) : (
            <View style={[styles.matchCallerAvatar, styles.matchCallerAvatarPh]}>
              <Text style={styles.matchCallerInitial}>{userName?.charAt(0) ?? '?'}</Text>
            </View>
          )}
          <Text style={styles.matchYouLabel}>You</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  matchOverlay: {
    flex: 1,
    backgroundColor: '#121018',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  cancelBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cancelBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  matchWaveArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 24,
  },
  matchRippleHub: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    overflow: 'visible',
  },
  matchRippleCircle: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 104,
    height: 104,
    marginLeft: -52,
    marginTop: -52,
    borderRadius: 52,
    borderWidth: 2.5,
    borderColor: 'rgba(174,140,255,0.9)',
    backgroundColor: 'transparent',
  },
  matchRippleCore: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#c4b5fd',
    zIndex: 2,
  },
  matchTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  matchSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 12,
    lineHeight: 20,
  },
  matchCallerRow: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  matchCallerAvatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 3,
    borderColor: '#fff',
  },
  matchCallerAvatarPh: {
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchCallerInitial: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
  },
  matchYouLabel: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '700',
  },
});
