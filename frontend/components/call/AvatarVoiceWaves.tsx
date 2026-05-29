import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useCallStateHooks } from '@stream-io/video-react-native-sdk';
import { CallingState, hasAudio, type StreamVideoParticipant } from '@stream-io/video-client';

const SPEAK_AUDIO_LEVEL_THRESHOLD = 0.06;

function participantIsAudible(
  participant: StreamVideoParticipant | undefined,
  microphoneMuted?: boolean
): boolean {
  if (!participant) return false;
  if (participant.isLocalParticipant && microphoneMuted) return false;
  if (participant.isSpeaking) return true;
  const level =
    typeof participant.audioLevel === 'number' && Number.isFinite(participant.audioLevel)
      ? participant.audioLevel
      : 0;
  return level >= SPEAK_AUDIO_LEVEL_THRESHOLD;
}

function participantAudioIntensity(
  participant: StreamVideoParticipant | undefined
): number {
  if (!participant) return 0;
  const level =
    typeof participant.audioLevel === 'number' && Number.isFinite(participant.audioLevel)
      ? participant.audioLevel
      : 0;
  return Math.min(1, Math.max(0, level));
}

type AvatarSoundWaveRingsProps = {
  active: boolean;
  /** 0–1 from Stream participant audio level; affects pulse speed when active. */
  intensity?: number;
};

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

type StreamParticipantVoiceWavesProps = {
  side: 'local' | 'remote';
  microphoneMuted?: boolean;
};

/** Must render inside Stream `StreamCall` (uses Stream participant audio state). */
export function StreamParticipantVoiceWaves({
  side,
  microphoneMuted = false,
}: StreamParticipantVoiceWavesProps): React.JSX.Element {
  const { useLocalParticipant, useRemoteParticipants } = useCallStateHooks();
  const localParticipant = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const remoteParticipant = remoteParticipants[0];

  const participant = side === 'local' ? localParticipant : remoteParticipant;
  const active = participantIsAudible(participant, side === 'local' ? microphoneMuted : false);
  const intensity = participantAudioIntensity(participant);

  return <AvatarSoundWaveRings active={active} intensity={intensity} />;
}

/** Peer muted badge — render inside `avatarWrap` on the remote participant column only. */
export function StreamParticipantMutedIndicator(): React.JSX.Element | null {
  const { useRemoteParticipants, useCallCallingState } = useCallStateHooks();
  const remoteParticipants = useRemoteParticipants();
  const remoteParticipant = remoteParticipants[0];
  const callingState = useCallCallingState();

  const showMuted =
    callingState === CallingState.JOINED &&
    Boolean(remoteParticipant) &&
    !hasAudio(remoteParticipant as StreamVideoParticipant);

  if (!showMuted) return null;

  return (
    <View style={mutedStyles.badge} pointerEvents="none">
      <Ionicons name="mic-off" size={12} color="#faf5ff" />
      <Text style={mutedStyles.label}>Muted</Text>
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

const mutedStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    bottom: 2,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(127, 29, 29, 0.92)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(254, 202, 202, 0.45)',
  },
  label: {
    color: '#fef2f2',
    fontSize: 10,
    fontWeight: '800',
  },
});
