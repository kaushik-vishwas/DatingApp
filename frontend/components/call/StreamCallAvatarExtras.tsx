import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useCallStateHooks } from '@stream-io/video-react-native-sdk';
import { CallingState, type StreamVideoParticipant } from '@stream-io/video-client';
import { AvatarSoundWaveRings } from './AvatarVoiceWaves';
import {
  startAndroidCellularCallHoldWatch,
  stopAndroidCellularCallHoldWatch,
  subscribeAndroidCellularCallHold,
} from '../../utils/androidCellularCallHold';

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

export type StreamMicControl = {
  toggle: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
};

/**
 * Bridges Stream microphone API to the parent screen (must render inside `StreamCall`).
 */
export function StreamMicControlBridge({
  controlRef,
  onMutedChange,
  onUserMuteToggled,
  userChosenMuteRef,
}: {
  controlRef: React.MutableRefObject<StreamMicControl | null>;
  onMutedChange: (muted: boolean) => void;
  /** Fired only when the user taps Mute/Unmute — used to signal the remote peer instantly. */
  onUserMuteToggled?: (muted: boolean) => void;
  /** True only after the user taps Mute/Unmute — not when Stream reports mute during connect. */
  userChosenMuteRef: React.MutableRefObject<boolean>;
}): null {
  const { useMicrophoneState, useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();
  const { microphone } = useMicrophoneState();
  const ensuredUnmuteAfterJoinRef = useRef(false);

  useEffect(() => {
    if (callingState !== CallingState.JOINED) {
      ensuredUnmuteAfterJoinRef.current = false;
      return;
    }
    if (ensuredUnmuteAfterJoinRef.current || userChosenMuteRef.current) return;
    ensuredUnmuteAfterJoinRef.current = true;
    onMutedChange(false);
    void microphone.enable().catch(() => {
      ensuredUnmuteAfterJoinRef.current = false;
    });
  }, [callingState, microphone, onMutedChange, userChosenMuteRef]);

  useEffect(() => {
    controlRef.current = {
      toggle: async () => {
        const nextMuted = !userChosenMuteRef.current;
        userChosenMuteRef.current = nextMuted;
        onMutedChange(nextMuted);
        onUserMuteToggled?.(nextMuted);
        if (nextMuted) {
          await microphone.disable();
        } else {
          await microphone.enable();
        }
      },
      setEnabled: async (enabled: boolean) => {
        if (enabled) {
          if (userChosenMuteRef.current) return;
          await microphone.enable();
        } else {
          await microphone.disable();
        }
      },
    };
    return () => {
      controlRef.current = null;
    };
  }, [controlRef, microphone, onMutedChange, onUserMuteToggled, userChosenMuteRef]);

  return null;
}

/**
 * Detects an active external cellular call (Android audio mode only).
 * Must render inside Stream `StreamCall`.
 */
export function StreamSystemHoldBridge({
  userChosenMuteRef,
  onSystemHoldChange,
}: {
  userChosenMuteRef: React.MutableRefObject<boolean>;
  /** Unused; hold is driven only by external cellular calls, not app background. */
  appInBackground: boolean;
  onSystemHoldChange: (onHold: boolean) => void;
}): null {
  const { useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();
  const onSystemHoldChangeRef = useRef(onSystemHoldChange);
  const callingStateRef = useRef(callingState);
  const holdActiveRef = useRef(false);
  onSystemHoldChangeRef.current = onSystemHoldChange;
  callingStateRef.current = callingState;

  const applyHoldState = (next: boolean): void => {
    if (holdActiveRef.current === next) return;
    holdActiveRef.current = next;
    onSystemHoldChangeRef.current(next);
  };

  useEffect(() => {
    if (callingState !== CallingState.JOINED) {
      holdActiveRef.current = false;
      if (Platform.OS === 'android') {
        stopAndroidCellularCallHoldWatch();
      }
      return;
    }

    if (Platform.OS !== 'android') {
      return;
    }

    const unsubCellular = subscribeAndroidCellularCallHold((active) => {
      if (userChosenMuteRef.current) {
        if (holdActiveRef.current) applyHoldState(false);
        return;
      }
      if (callingStateRef.current !== CallingState.JOINED) return;
      applyHoldState(active);
    });
    startAndroidCellularCallHoldWatch();

    return () => {
      unsubCellular();
      stopAndroidCellularCallHoldWatch();
    };
  }, [callingState, userChosenMuteRef]);

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

    if (firedRef.current) return;
    if (callingStateRef.current !== CallingState.JOINED) return;
    const stillRemote = participantsRef.current.some((p) => !p.isLocalParticipant);
    if (!stillRemote) return;
    firedRef.current = true;
    onBothConnectedRef.current();
  }, [callingState, participants]);

  return null;
}

/** Peer hold/mute badges on the remote avatar (signaled via socket, not Stream mic heuristics). */
export function StreamParticipantMutedIndicator({
  peerOnHold = false,
  peerMuted = false,
}: {
  peerOnHold?: boolean;
  peerMuted?: boolean;
  talkActive?: boolean;
}): React.JSX.Element | null {
  const { useRemoteParticipants, useCallCallingState } = useCallStateHooks();
  const remoteParticipants = useRemoteParticipants();
  const remoteParticipant = remoteParticipants[0];
  const callingState = useCallCallingState();

  const joined = callingState === CallingState.JOINED && Boolean(remoteParticipant);
  const showHold = peerOnHold && joined;
  const showMuted = !showHold && peerMuted && joined;

  if (!showHold && !showMuted) return null;

  if (showHold) {
    return (
      <View style={[mutedStyles.badge, mutedStyles.holdBadge]} pointerEvents="none">
        <Ionicons name="pause" size={12} color="#faf5ff" />
        <Text style={mutedStyles.label}>On hold</Text>
      </View>
    );
  }

  return (
    <View style={[mutedStyles.badge, mutedStyles.muteBadge]} pointerEvents="none">
      <Ionicons name="mic-off" size={12} color="#faf5ff" />
      <Text style={mutedStyles.label}>Muted</Text>
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
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
  },
  holdBadge: {
    backgroundColor: 'rgba(127, 29, 29, 0.92)',
    borderColor: 'rgba(254, 202, 202, 0.45)',
  },
  muteBadge: {
    backgroundColor: 'rgba(55, 48, 163, 0.92)',
    borderColor: 'rgba(199, 210, 254, 0.45)',
  },
  label: {
    color: '#fef2f2',
    fontSize: 10,
    fontWeight: '800',
  },
});
