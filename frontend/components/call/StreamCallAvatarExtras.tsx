import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
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
  const { microphone, optimisticIsMute, isMute } = useMicrophoneState();
  const streamMuted = Boolean(optimisticIsMute ?? isMute);
  const ensuredUnmuteAfterJoinRef = useRef(false);

  // Stream often reports muted for a moment while publishing audio — never mirror that in UI
  // unless the user explicitly tapped Mute.
  useEffect(() => {
    if (!userChosenMuteRef.current) {
      onMutedChange(false);
      return;
    }
    onMutedChange(streamMuted);
  }, [streamMuted, onMutedChange, userChosenMuteRef]);

  useEffect(() => {
    if (callingState !== CallingState.JOINED) {
      ensuredUnmuteAfterJoinRef.current = false;
      return;
    }
    if (ensuredUnmuteAfterJoinRef.current || userChosenMuteRef.current) return;
    ensuredUnmuteAfterJoinRef.current = true;
    void microphone.enable().catch(() => {
      ensuredUnmuteAfterJoinRef.current = false;
    });
  }, [callingState, microphone, userChosenMuteRef]);

  useEffect(() => {
    controlRef.current = {
      toggle: async () => {
        const next = !userChosenMuteRef.current;
        userChosenMuteRef.current = next;
        onMutedChange(next);
        if (next) {
          await microphone.disable();
        } else {
          await microphone.enable();
        }
      },
      setEnabled: async (enabled: boolean) => {
        if (enabled) {
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
/** Ignore transient missing mic right after JOINED (common when opening from a notification). */
const MIC_JOIN_GRACE_MS = 2000;
/** External call stole mic — require sustained loss before hold ON (Samsung mic flicker). */
const HOLD_ON_MS = 450;
/** Mic back — clear hold quickly for real-time UI on peer side. */
const HOLD_OFF_MS = 200;
const HOLD_POLL_MS = 100;

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

  const evaluateMicHold = (): void => {
    if (callingStateRef.current !== CallingState.JOINED) return;
    if (Platform.OS === 'android' && cellularActiveRef.current) return;

    const joinedAt = joinedAtRef.current;
    if (joinedAt !== null && Date.now() - joinedAt < MIC_JOIN_GRACE_MS) {
      return;
    }
    if (userChosenMuteRef.current) {
      audioLostSinceRef.current = null;
      micLiveSinceRef.current = null;
      if (holdActiveRef.current) {
        applyHoldState(false);
      }
      return;
    }

    const participant = localParticipantRef.current;
    const micLive = Boolean(participant && hasAudio(participant));

    if (micLive) {
      audioLostSinceRef.current = null;
      if (!holdActiveRef.current) {
        micLiveSinceRef.current = null;
        return;
      }
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
    const now = Date.now();
    if (audioLostSinceRef.current === null) {
      audioLostSinceRef.current = now;
    }
    if (!holdActiveRef.current && now - audioLostSinceRef.current >= HOLD_ON_MS) {
      applyHoldState(true);
    }
  };

  useEffect(() => {
    if (callingState !== CallingState.JOINED) {
      holdActiveRef.current = false;
      cellularActiveRef.current = false;
      audioLostSinceRef.current = null;
      micLiveSinceRef.current = null;
      joinedAtRef.current = null;
      return;
    }
    if (joinedAtRef.current === null) {
      joinedAtRef.current = Date.now();
    }

    evaluateMicHold();
    const intervalId = setInterval(evaluateMicHold, HOLD_POLL_MS);
    return () => clearInterval(intervalId);
  }, [callingState, localParticipant, userChosenMuteRef]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (callingState !== CallingState.JOINED) {
      stopAndroidCellularCallHoldWatch();
      return;
    }

    let cancelled = false;
    const unsub = subscribeAndroidCellularCallHold((active) => {
      if (cancelled) return;
      cellularActiveRef.current = active;
      if (userChosenMuteRef.current) {
        if (holdActiveRef.current) {
          applyHoldState(false);
        }
        return;
      }
      if (active) {
        audioLostSinceRef.current = null;
        micLiveSinceRef.current = null;
        applyHoldState(true);
        return;
      }
      if (holdActiveRef.current) {
        applyHoldState(false);
      }
    });

    void startAndroidCellularCallHoldWatch();

    return () => {
      cancelled = true;
      unsub();
      stopAndroidCellularCallHoldWatch();
      cellularActiveRef.current = false;
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

/** Grace after connect before showing peer "Muted" (Stream mic publish lag). */
const REMOTE_MUTE_GRACE_MS = 3000;
const REMOTE_MUTE_SUSTAIN_MS = 600;

/** Peer muted / on-hold badge — remote participant column only. */
export function StreamParticipantMutedIndicator({
  peerOnHold = false,
  talkActive = false,
}: {
  peerOnHold?: boolean;
  /** When false, never show connect-time muted flicker on the peer avatar. */
  talkActive?: boolean;
}): React.JSX.Element | null {
  const { useRemoteParticipants, useCallCallingState } = useCallStateHooks();
  const remoteParticipants = useRemoteParticipants();
  const remoteParticipant = remoteParticipants[0];
  const callingState = useCallCallingState();
  const talkActiveSinceRef = useRef<number | null>(null);
  const noAudioSinceRef = useRef<number | null>(null);
  const [showMutedBadge, setShowMutedBadge] = useState(false);
  const remoteParticipantRef = useRef(remoteParticipant);
  const callingStateRef = useRef(callingState);
  remoteParticipantRef.current = remoteParticipant;
  callingStateRef.current = callingState;

  const showHold =
    peerOnHold && callingState === CallingState.JOINED && Boolean(remoteParticipant);

  useEffect(() => {
    if (!talkActive) {
      talkActiveSinceRef.current = null;
      noAudioSinceRef.current = null;
      setShowMutedBadge(false);
      return;
    }
    if (talkActiveSinceRef.current === null) {
      talkActiveSinceRef.current = Date.now();
    }

    const evaluate = (): void => {
      if (peerOnHold || callingStateRef.current !== CallingState.JOINED) {
        noAudioSinceRef.current = null;
        setShowMutedBadge(false);
        return;
      }
      const remote = remoteParticipantRef.current;
      if (!remote) {
        noAudioSinceRef.current = null;
        setShowMutedBadge(false);
        return;
      }
      const sinceTalk =
        talkActiveSinceRef.current !== null
          ? Date.now() - talkActiveSinceRef.current
          : REMOTE_MUTE_GRACE_MS;
      if (sinceTalk < REMOTE_MUTE_GRACE_MS) {
        noAudioSinceRef.current = null;
        setShowMutedBadge(false);
        return;
      }
      if (hasAudio(remote as StreamVideoParticipant)) {
        noAudioSinceRef.current = null;
        setShowMutedBadge(false);
        return;
      }
      const now = Date.now();
      if (noAudioSinceRef.current === null) {
        noAudioSinceRef.current = now;
      }
      setShowMutedBadge(now - noAudioSinceRef.current >= REMOTE_MUTE_SUSTAIN_MS);
    };

    evaluate();
    const intervalId = setInterval(evaluate, 200);
    return () => clearInterval(intervalId);
  }, [talkActive, peerOnHold, callingState, remoteParticipant]);

  const showMuted = showMutedBadge && !showHold;

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
