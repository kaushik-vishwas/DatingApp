import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useCallStateHooks } from '@stream-io/video-react-native-sdk';
import { CallingState, hasAudio, type StreamVideoParticipant } from '@stream-io/video-client';
import { AvatarSoundWaveRings } from './AvatarVoiceWaves';

const SPEAK_AUDIO_LEVEL_THRESHOLD = 0.035;

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

function participantAudioIntensity(participant: StreamVideoParticipant | undefined): number {
  if (!participant) return 0;
  const level =
    typeof participant.audioLevel === 'number' && Number.isFinite(participant.audioLevel)
      ? participant.audioLevel
      : 0;
  const boosted = level * 2.2 + (participant.isSpeaking ? 0.3 : 0);
  return Math.min(1, Math.max(0, boosted));
}

type StreamParticipantVoiceWavesProps = {
  side: 'local' | 'remote';
  microphoneMuted?: boolean;
  /** True when this side is on hold (external phone call) — suppress voice-reactive rings. */
  onHold?: boolean;
};

/** Must render inside Stream `StreamCall` (uses Stream participant audio state). */
export function StreamParticipantVoiceWaves({
  side,
  microphoneMuted = false,
  onHold = false,
}: StreamParticipantVoiceWavesProps): React.JSX.Element {
  const { useLocalParticipant, useRemoteParticipants } = useCallStateHooks();
  const localParticipant = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const remoteParticipant = remoteParticipants[0];

  const participant = side === 'local' ? localParticipant : remoteParticipant;
  const active =
    !onHold &&
    participantIsAudible(participant, side === 'local' ? microphoneMuted : false);
  const intensity = onHold ? 0 : participantAudioIntensity(participant);

  return <AvatarSoundWaveRings active={active} intensity={intensity} />;
}

/**
 * Detects when the OS steals the mic (e.g. cellular call) while the user did not tap Mute.
 * Must render inside Stream `StreamCall`.
 */
export function StreamSystemHoldBridge({
  userMuted,
  appInBackground,
  onSystemHoldChange,
}: {
  userMuted: boolean;
  appInBackground: boolean;
  onSystemHoldChange: (onHold: boolean) => void;
}): null {
  const { useLocalParticipant, useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();
  const localParticipant = useLocalParticipant();
  const onSystemHoldChangeRef = useRef(onSystemHoldChange);
  const audioLostSinceRef = useRef<number | null>(null);
  onSystemHoldChangeRef.current = onSystemHoldChange;

  useEffect(() => {
    if (callingState !== CallingState.JOINED) {
      audioLostSinceRef.current = null;
      return;
    }
    if (appInBackground) {
      audioLostSinceRef.current = null;
      return;
    }
    if (userMuted) {
      audioLostSinceRef.current = null;
      onSystemHoldChangeRef.current(false);
      return;
    }
    const micLive = Boolean(localParticipant && hasAudio(localParticipant));
    if (micLive) {
      audioLostSinceRef.current = null;
      onSystemHoldChangeRef.current(false);
      return;
    }
    const now = Date.now();
    if (audioLostSinceRef.current === null) {
      audioLostSinceRef.current = now;
      return;
    }
    if (now - audioLostSinceRef.current >= 400) {
      onSystemHoldChangeRef.current(true);
    }
  }, [callingState, localParticipant, userMuted, appInBackground]);

  return null;
}

/**
 * Fires once when Stream reports JOINED with a remote participant (both sides in the call).
 * Used to start the talk timer immediately instead of waiting on slow HTTP polling.
 */
export function StreamTalkTimingBridge({
  onBothConnected,
}: {
  onBothConnected: () => void;
}): null {
  const { useCallCallingState, useParticipants } = useCallStateHooks();
  const callingState = useCallCallingState();
  const participants = useParticipants();
  const firedRef = useRef(false);
  const onBothConnectedRef = useRef(onBothConnected);
  const callingStateRef = useRef(callingState);
  const participantsRef = useRef(participants);
  onBothConnectedRef.current = onBothConnected;
  callingStateRef.current = callingState;
  participantsRef.current = participants;

  useEffect(() => {
    if (firedRef.current) return;
    if (callingState !== CallingState.JOINED) return;
    const hasRemote = participants.some((p) => !p.isLocalParticipant);
    if (!hasRemote) return;

    const timer = setTimeout(() => {
      if (firedRef.current) return;
      if (callingStateRef.current !== CallingState.JOINED) return;
      const stillRemote = participantsRef.current.some((p) => !p.isLocalParticipant);
      if (!stillRemote) return;
      firedRef.current = true;
      onBothConnectedRef.current();
    }, 80);

    return () => clearTimeout(timer);
  }, [callingState, participants]);

  return null;
}

/** Peer muted / on-hold badge — remote participant column only. */
export function StreamParticipantMutedIndicator({
  peerOnHold = false,
}: {
  peerOnHold?: boolean;
}): React.JSX.Element | null {
  const { useRemoteParticipants, useCallCallingState } = useCallStateHooks();
  const remoteParticipants = useRemoteParticipants();
  const remoteParticipant = remoteParticipants[0];
  const callingState = useCallCallingState();

  const showHold =
    peerOnHold && callingState === CallingState.JOINED && Boolean(remoteParticipant);
  const showMuted =
    !showHold &&
    callingState === CallingState.JOINED &&
    Boolean(remoteParticipant) &&
    !hasAudio(remoteParticipant as StreamVideoParticipant);

  if (!showHold && !showMuted) return null;

  return (
    <View style={mutedStyles.badge} pointerEvents="none">
      <Ionicons name={showHold ? 'pause' : 'mic-off'} size={12} color="#faf5ff" />
      <Text style={mutedStyles.label}>{showHold ? 'On hold' : 'Muted'}</Text>
    </View>
  );
}

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
