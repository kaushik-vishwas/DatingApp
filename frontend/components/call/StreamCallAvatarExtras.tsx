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
import {
  callDiag,
  HOLD_REMOTE_LEFT_DEBOUNCE_MS,
  isCallHoldGuardActive,
  NORMAL_REMOTE_LEFT_DEBOUNCE_MS,
  setGsmInterruptPending,
} from '../../utils/callDiagnostics';
import { isSamsungOneUi6OrNewer } from '../../utils/samsungCallCompat';

const AUDIO_MODE_IN_CALL = 2;
const AUDIO_MODE_IN_COMMUNICATION = 3;

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
    if (next) {
      callDiag.holdStarted('local_system');
    } else {
      callDiag.holdEnded('local_system');
    }
    onSystemHoldChangeRef.current(next);
  };

  useEffect(() => {
    callDiag.streamStateChange(String(callingState));
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

    const unsubCellular = subscribeAndroidCellularCallHold(({ active, audioMode, source }) => {
      if (userChosenMuteRef.current) {
        if (holdActiveRef.current) applyHoldState(false);
        setGsmInterruptPending(false);
        callDiag.info('gsm_hold_skipped_user_muted', { active, audioMode, source });
        return;
      }
      if (callingStateRef.current !== CallingState.JOINED) return;
      const modeLabel =
        audioMode === AUDIO_MODE_IN_CALL
          ? 'MODE_IN_CALL'
          : audioMode === AUDIO_MODE_IN_COMMUNICATION
            ? 'MODE_IN_COMMUNICATION'
            : `mode_${audioMode ?? 'unknown'}`;
      const samsung = isSamsungOneUi6OrNewer();
      if (active) {
        setGsmInterruptPending(true);
        callDiag.gsmDetected({ audioMode, modeLabel, source, samsung });
        callDiag.gsmAnswered({ audioMode, modeLabel, source, samsung });
        applyHoldState(true);
        return;
      }
      setGsmInterruptPending(false);
      callDiag.gsmEnded({ audioMode, modeLabel, source, samsung });
      applyHoldState(false);
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

  const fireOnce = (): void => {
    if (firedRef.current) return;
    if (callingStateRef.current !== CallingState.JOINED) return;
    const stillRemote = participantsRef.current.some((p) => !p.isLocalParticipant);
    if (!stillRemote) return;
    firedRef.current = true;
    callDiag.participantJoined({
      participantCount: participantsRef.current.length,
      remoteCount: participantsRef.current.filter((p) => !p.isLocalParticipant).length,
    });
    callDiag.callConnected({ source: 'stream_both_joined' });
    onBothConnectedRef.current();
  };

  useEffect(() => {
    if (firedRef.current) return;
    if (callingState !== CallingState.JOINED) return;
    fireOnce();
    if (firedRef.current) return;
    const intervalId = setInterval(fireOnce, 40);
    return () => clearInterval(intervalId);
  }, [callingState, participants]);

  return null;
}

const LOCAL_LEFT_CONFIRM_MS = 2_500;

/**
 * Fires when the remote participant leaves the Stream call (WebRTC path — works if socket `call:ended` is missed).
 */
export function StreamRemotePeerLeftBridge({
  onRemotePeerLeft,
}: {
  onRemotePeerLeft: (reason: 'local_left' | 'remote_empty') => void;
}): null {
  const { useCallCallingState, useRemoteParticipants } = useCallStateHooks();
  const callingState = useCallCallingState();
  const remoteParticipants = useRemoteParticipants();
  const hadRemoteRef = useRef(false);
  const emptySinceRef = useRef<number | null>(null);
  const localLeftSinceRef = useRef<number | null>(null);
  const liveSnapshotCountRef = useRef<number | null>(null);
  const onRemotePeerLeftRef = useRef(onRemotePeerLeft);
  const callingStateRef = useRef(callingState);
  const remoteParticipantsRef = useRef(remoteParticipants);
  onRemotePeerLeftRef.current = onRemotePeerLeft;
  callingStateRef.current = callingState;
  remoteParticipantsRef.current = remoteParticipants;

  const tryEndCall = (reason: 'local_left' | 'remote_empty', extra?: Record<string, unknown>): void => {
    if (isCallHoldGuardActive()) {
      callDiag.callEndSuppressed(reason, {
        holdGuard: true,
        remoteCount: remoteParticipantsRef.current.length,
        callingState: String(callingStateRef.current),
        ...extra,
      });
      return;
    }
    callDiag.participantLeft({ reason, ...extra });
    callDiag.callEndReason(`stream_${reason}`, {
      endCategory: reason === 'remote_empty' ? 'stream_participant_lost' : 'stream_state_change',
      ...extra,
    });
    onRemotePeerLeftRef.current(reason);
  };

  useEffect(() => {
    const remoteCount = remoteParticipants.length;
    callDiag.remoteParticipantCountChanged(
      liveSnapshotCountRef.current,
      remoteCount,
      'stream_remote_participants_hook'
    );
    liveSnapshotCountRef.current = remoteCount;
    callDiag.updateLive({ remoteParticipantCount: remoteCount });

    if (callingState !== CallingState.JOINED) {
      if (callingState === CallingState.LEFT) {
        const now = Date.now();
        if (localLeftSinceRef.current === null) {
          localLeftSinceRef.current = now;
          callDiag.streamStateChange('LEFT', { phase: 'local_left_pending' });
        } else if (now - localLeftSinceRef.current >= LOCAL_LEFT_CONFIRM_MS) {
          tryEndCall('local_left', { callingState: 'LEFT' });
        }
      } else {
        localLeftSinceRef.current = null;
      }
      if (callingState !== CallingState.LEFT) {
        hadRemoteRef.current = false;
        emptySinceRef.current = null;
      }
      return;
    }

    localLeftSinceRef.current = null;

    const evaluate = (): void => {
      if (callingStateRef.current === CallingState.LEFT) {
        const now = Date.now();
        if (localLeftSinceRef.current === null) {
          localLeftSinceRef.current = now;
          return;
        }
        if (now - localLeftSinceRef.current >= LOCAL_LEFT_CONFIRM_MS) {
          tryEndCall('local_left', { callingState: 'LEFT' });
        }
        return;
      }
      if (callingStateRef.current !== CallingState.JOINED) {
        hadRemoteRef.current = false;
        emptySinceRef.current = null;
        return;
      }

      const hasRemote = remoteParticipantsRef.current.length > 0;
      if (hasRemote) {
        if (emptySinceRef.current !== null) {
          callDiag.connectionRestored({
            remoteCount: remoteParticipantsRef.current.length,
          });
        }
        hadRemoteRef.current = true;
        emptySinceRef.current = null;
        return;
      }
      if (!hadRemoteRef.current) return;

      const now = Date.now();
      if (emptySinceRef.current === null) {
        emptySinceRef.current = now;
        callDiag.connectionLost({
          remoteCount: 0,
          holdGuard: isCallHoldGuardActive(),
        });
      }
      const debounceMs = isCallHoldGuardActive()
        ? HOLD_REMOTE_LEFT_DEBOUNCE_MS
        : NORMAL_REMOTE_LEFT_DEBOUNCE_MS;
      if (now - emptySinceRef.current >= debounceMs) {
        hadRemoteRef.current = false;
        emptySinceRef.current = null;
        tryEndCall('remote_empty', {
          debounceMs,
          holdGuard: isCallHoldGuardActive(),
        });
      }
    };

    evaluate();
    const intervalId = setInterval(evaluate, 250);
    return () => clearInterval(intervalId);
  }, [callingState, remoteParticipants]);

  return null;
}

/** Peer hold/mute badges on the remote avatar. Hold uses socket; mute reads Stream publish state. */
const REMOTE_MUTE_JOIN_GRACE_MS = 1500;
const REMOTE_MUTE_ON_MS = 180;
const REMOTE_MUTE_OFF_MS = 120;
const REMOTE_MUTE_POLL_MS = 80;

export function StreamParticipantMutedIndicator({
  peerOnHold = false,
}: {
  peerOnHold?: boolean;
  peerMuted?: boolean;
  talkActive?: boolean;
}): React.JSX.Element | null {
  const { useRemoteParticipants, useCallCallingState } = useCallStateHooks();
  const remoteParticipants = useRemoteParticipants();
  const remoteParticipant = remoteParticipants[0];
  const callingState = useCallCallingState();
  const [remoteMuted, setRemoteMuted] = useState(false);
  const remoteJoinedAtRef = useRef<number | null>(null);
  const audioOffSinceRef = useRef<number | null>(null);
  const audioOnSinceRef = useRef<number | null>(null);
  const peerOnHoldRef = useRef(peerOnHold);
  peerOnHoldRef.current = peerOnHold;

  useEffect(() => {
    if (callingState !== CallingState.JOINED || !remoteParticipant) {
      remoteJoinedAtRef.current = null;
      audioOffSinceRef.current = null;
      audioOnSinceRef.current = null;
      setRemoteMuted(false);
      return;
    }

    if (remoteJoinedAtRef.current === null) {
      remoteJoinedAtRef.current = Date.now();
    }

    const evaluate = (): void => {
      if (peerOnHoldRef.current) {
        audioOffSinceRef.current = null;
        audioOnSinceRef.current = null;
        setRemoteMuted(false);
        return;
      }

      const joinedAt = remoteJoinedAtRef.current;
      const inGrace =
        joinedAt !== null && Date.now() - joinedAt < REMOTE_MUTE_JOIN_GRACE_MS;
      if (inGrace) {
        audioOffSinceRef.current = null;
        audioOnSinceRef.current = null;
        setRemoteMuted(false);
        return;
      }

      const micLive = hasAudio(remoteParticipant);
      const now = Date.now();

      if (!micLive) {
        audioOnSinceRef.current = null;
        if (audioOffSinceRef.current === null) {
          audioOffSinceRef.current = now;
        }
        if (now - audioOffSinceRef.current >= REMOTE_MUTE_ON_MS) {
          setRemoteMuted(true);
        }
        return;
      }

      audioOffSinceRef.current = null;
      if (audioOnSinceRef.current === null) {
        audioOnSinceRef.current = now;
      }
      if (now - audioOnSinceRef.current >= REMOTE_MUTE_OFF_MS) {
        audioOnSinceRef.current = null;
        setRemoteMuted(false);
      }
    };

    evaluate();
    const intervalId = setInterval(evaluate, REMOTE_MUTE_POLL_MS);
    return () => clearInterval(intervalId);
  }, [callingState, remoteParticipant, peerOnHold]);

  const joined = callingState === CallingState.JOINED && Boolean(remoteParticipant);
  const showHold = peerOnHold && joined;
  const showMuted = !showHold && remoteMuted && joined;

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
