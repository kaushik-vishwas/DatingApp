import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

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

type TravelWaveProps = {
  progress: Animated.Value;
};

/** One call-style arc packet traveling You → peer (right → left). */
function TravelWaveArc({ progress }: TravelWaveProps): React.JSX.Element {
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [22, -22],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.12, 0.5, 0.88, 1],
    outputRange: [0, 0.95, 1, 0.55, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.72, 1, 1.12],
  });

  return (
    <Animated.View
      style={[
        travelStyles.arcHost,
        { opacity, transform: [{ translateX }, { scale }] },
      ]}
      pointerEvents="none"
    >
      <View style={[travelStyles.arc, travelStyles.arcOuter]} />
      <View style={[travelStyles.arc, travelStyles.arcMid]} />
      <View style={[travelStyles.arc, travelStyles.arcInner]} />
    </Animated.View>
  );
}

type CallingProfileTravelWavesProps = {
  active: boolean;
};

/**
 * Phone-call style waves traveling between the two profile avatars
 * (You → peer) while ringing / connecting.
 */
export function CallingProfileTravelWaves({
  active,
}: CallingProfileTravelWavesProps): React.JSX.Element | null {
  const w0 = useRef(new Animated.Value(0)).current;
  const w1 = useRef(new Animated.Value(0)).current;
  const w2 = useRef(new Animated.Value(0)).current;
  const loopsRef = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    loopsRef.current.forEach((l) => l.stop());
    loopsRef.current = [];
    if (!active) {
      w0.setValue(0);
      w1.setValue(0);
      w2.setValue(0);
      return;
    }

    const makeLoop = (value: Animated.Value, delayMs: number) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(delayMs),
          Animated.timing(value, {
            toValue: 1,
            duration: 1400,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
      value.setValue(0);
      loop.start();
      return loop;
    };

    loopsRef.current = [makeLoop(w0, 0), makeLoop(w1, 460), makeLoop(w2, 920)];

    return () => {
      loopsRef.current.forEach((l) => l.stop());
      loopsRef.current = [];
      w0.setValue(0);
      w1.setValue(0);
      w2.setValue(0);
    };
  }, [active, w0, w1, w2]);

  if (!active) return null;

  return (
    <View style={travelStyles.bridge} pointerEvents="none">
      <View style={travelStyles.rail} />
      <TravelWaveArc progress={w0} />
      <TravelWaveArc progress={w1} />
      <TravelWaveArc progress={w2} />
    </View>
  );
}

type CallingWaitFooterProps = {
  active: boolean;
  peerName: string;
  phase?: 'ringing' | 'joining' | 'connecting';
};

function EqualizerBar({
  progress,
  maxHeight,
}: {
  progress: Animated.Value;
  maxHeight: number;
}): React.JSX.Element {
  const height = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [10, maxHeight],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.45, 1, 0.55],
  });
  return (
    <Animated.View
      style={[footerStyles.bar, { height, opacity }]}
      pointerEvents="none"
    />
  );
}

/**
 * Fills empty space under profiles while waiting to connect:
 * equalizer animation + short status copy.
 */
export function CallingWaitFooter({
  active,
  peerName,
  phase = 'ringing',
}: CallingWaitFooterProps): React.JSX.Element | null {
  const bars = useRef([
    new Animated.Value(0.2),
    new Animated.Value(0.55),
    new Animated.Value(0.35),
    new Animated.Value(0.7),
    new Animated.Value(0.4),
  ]).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const loopsRef = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    loopsRef.current.forEach((l) => l.stop());
    loopsRef.current = [];
    if (!active) {
      bars.forEach((b) => b.setValue(0.2));
      breathe.setValue(0);
      return;
    }

    const makeBarLoop = (value: Animated.Value, upMs: number, downMs: number, delayMs: number) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(delayMs),
          Animated.timing(value, {
            toValue: 1,
            duration: upMs,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(value, {
            toValue: 0.15,
            duration: downMs,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
        ])
      );
      loop.start();
      return loop;
    };

    loopsRef.current = [
      makeBarLoop(bars[0], 420, 380, 0),
      makeBarLoop(bars[1], 360, 440, 80),
      makeBarLoop(bars[2], 480, 320, 140),
      makeBarLoop(bars[3], 340, 400, 40),
      makeBarLoop(bars[4], 400, 360, 110),
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, {
            toValue: 1,
            duration: 1600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(breathe, {
            toValue: 0,
            duration: 1600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ),
    ];
    loopsRef.current[5]?.start();

    return () => {
      loopsRef.current.forEach((l) => l.stop());
      loopsRef.current = [];
    };
  }, [active, bars, breathe]);

  if (!active) return null;

  const name = peerName.trim() || 'them';
  const line1 =
    phase === 'ringing'
      ? `Calling ${name}…`
      : phase === 'joining'
        ? `Connecting with ${name}…`
        : `Almost there with ${name}…`;
  const line2 =
    phase === 'ringing'
      ? 'Stay on this screen — they will join in a moment.'
      : 'Setting up your private voice line.';

  const glowOpacity = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.85],
  });
  const glowScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1.06],
  });

  return (
    <View style={footerStyles.wrap} pointerEvents="none">
      <Animated.View
        style={[
          footerStyles.glow,
          { opacity: glowOpacity, transform: [{ scale: glowScale }] },
        ]}
      />
      <View style={footerStyles.eqRow}>
        <EqualizerBar progress={bars[0]} maxHeight={28} />
        <EqualizerBar progress={bars[1]} maxHeight={42} />
        <EqualizerBar progress={bars[2]} maxHeight={54} />
        <EqualizerBar progress={bars[3]} maxHeight={40} />
        <EqualizerBar progress={bars[4]} maxHeight={30} />
      </View>
      <Text style={footerStyles.line1}>{line1}</Text>
      <Text style={footerStyles.line2}>{line2}</Text>
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

const travelStyles = StyleSheet.create({
  bridge: {
    width: 64,
    height: 100,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  rail: {
    position: 'absolute',
    width: 48,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(196, 181, 253, 0.28)',
  },
  arcHost: {
    position: 'absolute',
    width: 36,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arc: {
    position: 'absolute',
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    backgroundColor: 'transparent',
  },
  arcOuter: {
    width: 34,
    height: 48,
    borderRadius: 17,
    borderRightWidth: 2.5,
    borderColor: 'rgba(233, 213, 255, 0.9)',
  },
  arcMid: {
    width: 24,
    height: 34,
    borderRadius: 12,
    borderRightWidth: 2.5,
    borderColor: 'rgba(196, 181, 253, 0.95)',
  },
  arcInner: {
    width: 14,
    height: 20,
    borderRadius: 7,
    borderRightWidth: 2.5,
    borderColor: 'rgba(167, 139, 250, 1)',
  },
});

const footerStyles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    marginTop: 18,
    marginBottom: 4,
  },
  glow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(124, 58, 237, 0.22)',
  },
  eqRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 7,
    height: 52,
    marginBottom: 14,
  },
  bar: {
    width: 7,
    borderRadius: 4,
    backgroundColor: '#c4b5fd',
  },
  line1: {
    color: '#faf5ff',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  line2: {
    color: 'rgba(237, 233, 254, 0.78)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },
});
