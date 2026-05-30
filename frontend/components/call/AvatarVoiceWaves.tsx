import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

type AvatarSoundWaveRingsProps = {
  active: boolean;
  /** 0–1 from Stream participant audio level; affects pulse speed when active. */
  intensity?: number;
};

/** Voice-reactive rings (no Stream native deps — safe for Expo Go bundle). */
export function AvatarSoundWaveRings({
  active,
  intensity = 0,
}: AvatarSoundWaveRingsProps): React.JSX.Element | null {
  const pulse = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!active) {
      loopRef.current?.stop();
      pulse.stopAnimation(() => {
        pulse.setValue(0);
      });
      return;
    }

    const duration = Math.max(700, 1600 - intensity * 700);
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    loopRef.current = loop;
    pulse.setValue(0);
    loop.start();

    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [active, intensity, pulse]);

  if (!active) return null;

  const scaleOuter = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1.12 + intensity * 0.3],
  });
  const scaleInner = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.18 + intensity * 0.34],
  });
  const opacity = pulse.interpolate({ inputRange: [0, 0.65, 1], outputRange: [0.55, 0.2, 0] });

  return (
    <View style={waveStyles.halo} pointerEvents="none">
      <Animated.View style={[waveStyles.ring, { transform: [{ scale: scaleOuter }], opacity }]} />
      <Animated.View
        style={[
          waveStyles.ring,
          waveStyles.ringDelay,
          {
            transform: [{ scale: scaleInner }],
            opacity: pulse.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0.4, 0.12, 0] }),
          },
        ]}
      />
    </View>
  );
}

const waveStyles = StyleSheet.create({
  halo: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: 'rgba(196, 181, 253, 0.65)',
  },
  ringDelay: {
    borderColor: 'rgba(167, 139, 250, 0.45)',
  },
});
