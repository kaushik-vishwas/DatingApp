import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useCallStateHooks } from '@stream-io/video-react-native-sdk';
import { CallingState, hasAudio, type StreamVideoParticipant } from '@stream-io/video-client';
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
  userChosenMuteRef,
}: {
  controlRef: React.MutableRefObject<StreamMicControl | null>;
  onMutedChange: (muted: boolean) => void;
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
  }, [controlRef, microphone, onMutedChange, userChosenMuteRef]);

  return null;
}

/**
 * Detects when the OS steals the mic (e.g. cellular call) while the user did not tap Mute.
 * Must render inside Stream `StreamCall`.
 */
/** Ignore transient missing mic right after JOINED (not applied to cellular audio-mode hold). */
const MIC_JOIN_GRACE_MS = 1200;
/** External call stole mic — short sustain to avoid Samsung flicker. */
const HOLD_ON_MS = 280;
/** Mic back — clear hold quickly for real-time peer UI. */
const HOLD_OFF_MS = 150;
const HOLD_POLL_MS = 80;

export function StreamSystemHoldBridge({
  userChosenMuteRef,
  onSystemHoldChange,
}: {
  userChosenMuteRef: React.MutableRefObject<boolean>;
  /** Unused; hold is driven only by OS mic loss (external phone call), not app background. */
  appInBackground: boolean;
  onSystemHoldChange: (onHold: boolean) => void;
}): null {
  const { useLocalParticipant, useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();
  const localParticipant = useLocalParticipant();
  const onSystemHoldChangeRef = useRef(onSystemHoldChange);
  const localParticipantRef = useRef(localParticipant);
  const callingStateRef = useRef(callingState);
  const holdActiveRef = useRef(false);
  const cellularActiveRef = useRef(false);
  const audioLostSinceRef = useRef<number | null>(null);
  const micLiveSinceRef = useRef<number | null>(null);
  const joinedAtRef = useRef<number | null>(null);
  onSystemHoldChangeRef.current = onSystemHoldChange;
  localParticipantRef.current = localParticipant;
  callingStateRef.current = callingState;

  const applyHoldState = (next: boolean): void => {
    if (holdActiveRef.current === next) return;
    holdActiveRef.current = next;
    onSystemHoldChangeRef.current(next);
  };

  const evaluateHold = (): void => {
    if (callingStateRef.current !== CallingState.JOINED) return;

    if (userChosenMuteRef.current) {
      audioLostSinceRef.current = null;
      micLiveSinceRef.current = null;
      if (holdActiveRef.current) {
        applyHoldState(false);
      }
      return;
    }

    const joinedAt = joinedAtRef.current;
    const inJoinGrace =
      joinedAt !== null && Date.now() - joinedAt < MIC_JOIN_GRACE_MS;

    const cellularHold = Platform.OS === 'android' && cellularActiveRef.current;
    const participant = localParticipantRef.current;
    const micLive = Boolean(participant && hasAudio(participant));

    let micHold = false;
    if (!micLive) {
      const now = Date.now();
      if (audioLostSinceRef.current === null) {
        audioLostSinceRef.current = now;
      }
      micHold = !inJoinGrace && now - audioLostSinceRef.current >= HOLD_ON_MS;
    } else {
      audioLostSinceRef.current = null;
    }

    const shouldHoldOn = cellularHold || micHold;
    if (shouldHoldOn) {
      micLiveSinceRef.current = null;
      applyHoldState(true);
      return;
    }

    if (!holdActiveRef.current) return;

    if (micLive) {
      const now = Date.now();
      if (micLiveSinceRef.current === null) {
        micLiveSinceRef.current = now;
      }
      if (now - micLiveSinceRef.current >= HOLD_OFF_MS) {
        micLiveSinceRef.current = null;
        applyHoldState(false);
      }
      return;
    }

    micLiveSinceRef.current = null;
  };

  useEffect(() => {
    if (callingState !== CallingState.JOINED) {
      holdActiveRef.current = false;
      cellularActiveRef.current = false;
      audioLostSinceRef.current = null;
      micLiveSinceRef.current = null;
      joinedAtRef.current = null;
      if (Platform.OS === 'android') {
        stopAndroidCellularCallHoldWatch();
      }
      return;
    }
    if (joinedAtRef.current === null) {
      joinedAtRef.current = Date.now();
    }

    let unsubCellular = (): void => {};
    if (Platform.OS === 'android') {
      unsubCellular = subscribeAndroidCellularCallHold((active) => {
        cellularActiveRef.current = active;
        if (userChosenMuteRef.current) return;
        if (callingStateRef.current !== CallingState.JOINED) return;
        if (active) {
          audioLostSinceRef.current = null;
          micLiveSinceRef.current = null;
          applyHoldState(true);
          return;
        }
        evaluateHold();
      });
      startAndroidCellularCallHoldWatch();
    }

    evaluateHold();
    const intervalId = setInterval(evaluateHold, HOLD_POLL_MS);
    return () => {
      clearInterval(intervalId);
      unsubCellular();
      if (Platform.OS === 'android') {
        stopAndroidCellularCallHoldWatch();
      }
      cellularActiveRef.current = false;
    };
  }, [callingState, localParticipant, userChosenMuteRef]);

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

/** Peer on-hold badge only — no "Muted" badge (Stream mic publish lags look like mute on connect). */
export function StreamParticipantMutedIndicator({
  peerOnHold = false,
}: {
  peerOnHold?: boolean;
  talkActive?: boolean;
}): React.JSX.Element | null {
  const { useRemoteParticipants, useCallCallingState } = useCallStateHooks();
  const remoteParticipants = useRemoteParticipants();
  const remoteParticipant = remoteParticipants[0];
  const callingState = useCallCallingState();

  const showHold =
    peerOnHold && callingState === CallingState.JOINED && Boolean(remoteParticipant);

  if (!showHold) return null;

  return (
    <View style={mutedStyles.badge} pointerEvents="none">
      <Ionicons name="pause" size={12} color="#faf5ff" />
      <Text style={mutedStyles.label}>On hold</Text>
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
