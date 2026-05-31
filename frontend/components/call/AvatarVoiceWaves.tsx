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

    const duration = Math.max(520, 1300 - intensity * 850);
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.cubic),
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

  const peakBoost = 0.22 + intensity * 0.38;
  const scaleGlow = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1.08 + peakBoost],
  });
  const scaleOuter = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.18 + peakBoost],
  });
  const scaleMid = pulse.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0.92, 1.02, 1.28 + peakBoost],
  });
  const scaleInner = pulse.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0.94, 1.06, 1.36 + peakBoost],
  });
  const opacityGlow = pulse.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0.72, 0.38, 0],
  });
  const opacityOuter = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.95, 0.45, 0],
  });
  const opacityMid = pulse.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0.85, 0.32, 0],
  });
  const opacityInner = pulse.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0.75, 0.28, 0],
  });

  return (
    <View style={waveStyles.halo} pointerEvents="none">
      <Animated.View
        style={[waveStyles.glowFill, { transform: [{ scale: scaleGlow }], opacity: opacityGlow }]}
      />
      <Animated.View
        style={[waveStyles.ring, waveStyles.ringOuter, { transform: [{ scale: scaleOuter }], opacity: opacityOuter }]}
      />
      <Animated.View
        style={[waveStyles.ring, waveStyles.ringMid, { transform: [{ scale: scaleMid }], opacity: opacityMid }]}
      />
      <Animated.View
        style={[
          waveStyles.ring,
          waveStyles.ringInner,
          { transform: [{ scale: scaleInner }], opacity: opacityInner },
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
  glowFill: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: 'rgba(167, 139, 250, 0.35)',
    shadowColor: '#c4b5fd',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 14,
    elevation: 8,
  },
  ring: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 3,
  },
  ringOuter: {
    borderColor: 'rgba(233, 213, 255, 0.95)',
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
  },
  ringMid: {
    borderColor: 'rgba(196, 181, 253, 0.9)',
    borderWidth: 3.5,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  ringInner: {
    borderColor: 'rgba(167, 139, 250, 0.85)',
    borderWidth: 2.5,
    backgroundColor: 'rgba(91, 33, 182, 0.08)',
  },
});
