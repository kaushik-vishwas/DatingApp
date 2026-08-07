import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useCallStateHooks, useCall } from '@stream-io/video-react-native-sdk';
import { CallingState, type StreamVideoParticipant } from '@stream-io/video-client';
import { AvatarSoundWaveRings } from './AvatarVoiceWaves';
import {
  ANDROID_TALK_GSM_SUSPECT_DEBOUNCE_MS,
  callDiag,
  getCallDiagnosticsSnapshot,
  HOLD_REMOTE_LEFT_DEBOUNCE_MS,
  isCallHoldGuardActive,
  isTalkActiveForGsmGuard,
  NORMAL_REMOTE_LEFT_DEBOUNCE_MS,
  setGsmInterruptPending,
} from '../../utils/callDiagnostics';
import { isAndroidApi36OrNewer } from '../../utils/samsungCallCompat';

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
  forceMicOff = false,
}: {
  controlRef: React.MutableRefObject<StreamMicControl | null>;
  onMutedChange: (muted: boolean) => void;
  /** Fired only when the user taps Mute/Unmute — used to signal the remote peer instantly. */
  onUserMuteToggled?: (muted: boolean) => void;
  /** True only after the user taps Mute/Unmute — not when Stream reports mute during connect. */
  userChosenMuteRef: React.MutableRefObject<boolean>;
  /** GSM / peer hold — keep mic disabled even if user did not tap mute. */
  forceMicOff?: boolean;
}): null {
  const { useMicrophoneState, useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();
  const { microphone } = useMicrophoneState();
  const ensuredUnmuteAfterJoinRef = useRef(false);
  const forceMicOffRef = useRef(forceMicOff);
  forceMicOffRef.current = forceMicOff;

  useEffect(() => {
    const enforceOff = (): void => {
      if (!forceMicOffRef.current) return;
      void microphone.disable().catch(() => {});
    };
    enforceOff();
    if (!forceMicOff) return;
    const intervalId = setInterval(enforceOff, 100);
    return () => clearInterval(intervalId);
  }, [forceMicOff, microphone]);

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
        } else if (!forceMicOffRef.current) {
          await microphone.enable();
        }
      },
      setEnabled: async (enabled: boolean) => {
        if (!enabled || forceMicOffRef.current) {
          await microphone.disable();
          return;
        }
        if (userChosenMuteRef.current) return;
        await microphone.enable();
      },
    };
    return () => {
      controlRef.current = null;
    };
  }, [controlRef, microphone, onMutedChange, onUserMuteToggled, userChosenMuteRef]);

  return null;
}

/**
 * @deprecated Cellular hold is handled by AndroidCellularHoldMonitor on VoiceCallScreen.
 */
export function StreamSystemHoldBridge({
  onSystemHoldChange: _onSystemHoldChange,
}: {
  userChosenMuteRef: React.MutableRefObject<boolean>;
  appInBackground: boolean;
  onSystemHoldChange: (onHold: boolean) => void;
}): null {
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

const LOCAL_LEFT_CONFIRM_MS = isAndroidApi36OrNewer() ? 8_000 : 2_500;

/**
 * Fires when the remote participant leaves the Stream call (WebRTC path — works if socket `call:ended` is missed).
 */
export function StreamRemotePeerLeftBridge({
  onRemotePeerLeft,
  onLocalGsmSuspect,
  onPeerGsmSuspect,
}: {
  onRemotePeerLeft: (reason: 'local_left' | 'remote_empty') => void;
  /** Fired when this device leaves Stream during talk — likely answered a cellular call. */
  onLocalGsmSuspect?: () => void;
  /** Fired when the remote leaves Stream during talk — likely answered a cellular call. */
  onPeerGsmSuspect?: () => void;
}): null {
  const { useCallCallingState, useRemoteParticipants } = useCallStateHooks();
  const callingState = useCallCallingState();
  const remoteParticipants = useRemoteParticipants();
  const hadRemoteRef = useRef(false);
  const emptySinceRef = useRef<number | null>(null);
  const localLeftSinceRef = useRef<number | null>(null);
  const liveSnapshotCountRef = useRef<number | null>(null);
  const onRemotePeerLeftRef = useRef(onRemotePeerLeft);
  const onLocalGsmSuspectRef = useRef(onLocalGsmSuspect);
  const onPeerGsmSuspectRef = useRef(onPeerGsmSuspect);
  const gsmSuspectArmedRef = useRef(false);
  const callingStateRef = useRef(callingState);
  const remoteParticipantsRef = useRef(remoteParticipants);
  onRemotePeerLeftRef.current = onRemotePeerLeft;
  onLocalGsmSuspectRef.current = onLocalGsmSuspect;
  onPeerGsmSuspectRef.current = onPeerGsmSuspect;
  callingStateRef.current = callingState;
  remoteParticipantsRef.current = remoteParticipants;

  const armGsmSuspectGuard = (reason: 'local_left' | 'remote_empty'): void => {
    if (gsmSuspectArmedRef.current) return;
    if (!isTalkActiveForGsmGuard()) {
      callDiag.info('stream_gsm_suspect_skipped', { reason, talkActive: isTalkActiveForGsmGuard() });
      return;
    }
    gsmSuspectArmedRef.current = true;
    setGsmInterruptPending(true, `stream_gsm_suspect_${reason}`);
    callDiag.info('stream_gsm_suspect', { reason });
    if (reason === 'local_left') {
      onLocalGsmSuspectRef.current?.();
      return;
    }
    onPeerGsmSuspectRef.current?.();
  };

  const resolveRemoteLeftDebounceMs = (): number => {
    if (isCallHoldGuardActive()) {
      return HOLD_REMOTE_LEFT_DEBOUNCE_MS;
    }
    if (Platform.OS === 'android' && getCallDiagnosticsSnapshot().talkActive) {
      return ANDROID_TALK_GSM_SUSPECT_DEBOUNCE_MS;
    }
    return NORMAL_REMOTE_LEFT_DEBOUNCE_MS;
  };

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

  const holdGuardWasActiveRef = useRef(isCallHoldGuardActive());

  /** After GSM/peer hold ends, start remote-empty / local-left timers fresh — do not inherit GSM-era gaps. */
  const resetLeftTimersAfterHoldClear = (): void => {
    emptySinceRef.current = null;
    localLeftSinceRef.current = null;
    gsmSuspectArmedRef.current = false;
    callDiag.info('hold_guard_cleared_reset_left_timers', {
      callingState: String(callingStateRef.current),
      remoteCount: remoteParticipantsRef.current.length,
    });
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
      const tickLeft = (): void => {
        const guardActive = isCallHoldGuardActive();
        if (holdGuardWasActiveRef.current && !guardActive) {
          resetLeftTimersAfterHoldClear();
        }
        holdGuardWasActiveRef.current = guardActive;

        if (callingStateRef.current !== CallingState.LEFT) {
          localLeftSinceRef.current = null;
          return;
        }
        const now = Date.now();
        if (localLeftSinceRef.current === null) {
          localLeftSinceRef.current = now;
          armGsmSuspectGuard('local_left');
          callDiag.streamStateChange('LEFT', { phase: 'local_left_pending' });
          return;
        }
        if (now - localLeftSinceRef.current >= LOCAL_LEFT_CONFIRM_MS) {
          tryEndCall('local_left', { callingState: 'LEFT' });
        }
      };
      if (callingState !== CallingState.LEFT) {
        hadRemoteRef.current = false;
        emptySinceRef.current = null;
        gsmSuspectArmedRef.current = false;
        localLeftSinceRef.current = null;
      }
      tickLeft();
      const leftIntervalId = setInterval(tickLeft, 250);
      return () => clearInterval(leftIntervalId);
    }

    localLeftSinceRef.current = null;

    const evaluate = (): void => {
      const guardActive = isCallHoldGuardActive();
      if (holdGuardWasActiveRef.current && !guardActive) {
        resetLeftTimersAfterHoldClear();
      }
      holdGuardWasActiveRef.current = guardActive;

      if (callingStateRef.current === CallingState.LEFT) {
        const now = Date.now();
        if (localLeftSinceRef.current === null) {
          localLeftSinceRef.current = now;
          armGsmSuspectGuard('local_left');
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
        gsmSuspectArmedRef.current = false;
        return;
      }
      if (!hadRemoteRef.current) return;

      const now = Date.now();
      if (emptySinceRef.current === null) {
        emptySinceRef.current = now;
        armGsmSuspectGuard('remote_empty');
        callDiag.connectionLost({
          remoteCount: 0,
          holdGuard: isCallHoldGuardActive(),
        });
      }
      const debounceMs = resolveRemoteLeftDebounceMs();
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

/** Peer hold/mute badges on the remote avatar. Both use socket state (not Stream mic detection). */
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
  const showHold = peerOnHold;
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

type HoldAudioTrack = {
  enabled: boolean;
  _enabled?: boolean;
  _setVolume?: (volume: number) => void;
};

function forceTrackEnabledLatch(track: HoldAudioTrack, enabled: boolean): void {
  try {
    // MediaStreamTrack.enabled early-returns when JS already matches, even if native
    // re-toggled the same track object during GSM — clear that latch first.
    if (typeof track._enabled === 'boolean') {
      track._enabled = !enabled;
    }
    track.enabled = enabled;
  } catch {
    // ignore
  }
}

function forceRemoteTrackSilent(track: HoldAudioTrack): void {
  try {
    // Always drive native gain — survives OEM/GSM ducking better than enabled alone.
    track._setVolume?.(0);
  } catch {
    // ignore
  }
  forceTrackEnabledLatch(track, false);
}

function forceRemoteTrackAudible(track: HoldAudioTrack): void {
  try {
    track._setVolume?.(1);
  } catch {
    // ignore
  }
  forceTrackEnabledLatch(track, true);
}

/** Force mic off during GSM hold (peer must not hear us). No mute badge — hold UI only. */
export function StreamLocalHoldMicBridge({
  systemOnHold = false,
  peerOnHold = false,
  userChosenMuteRef,
}: {
  systemOnHold?: boolean;
  peerOnHold?: boolean;
  userChosenMuteRef: React.MutableRefObject<boolean>;
}): null {
  const call = useCall();
  const { useMicrophoneState, useLocalParticipant } = useCallStateHooks();
  const { microphone } = useMicrophoneState();
  const localParticipant = useLocalParticipant();
  // Mute local publish while WE are on an external call (so peer cannot hear us).
  const pauseMic = systemOnHold;
  const pauseMicRef = useRef(pauseMic);
  pauseMicRef.current = pauseMic;
  const localParticipantRef = useRef(localParticipant);
  localParticipantRef.current = localParticipant;

  useEffect(() => {
    const applyMic = (): void => {
      if (pauseMicRef.current) {
        void microphone.disable().catch(() => {});
        const stream = localParticipantRef.current?.audioStream;
        if (stream) {
          for (const track of stream.getAudioTracks()) {
            forceTrackEnabledLatch(track as unknown as HoldAudioTrack, false);
          }
        }
        return;
      }
      if (!userChosenMuteRef.current) {
        void microphone.enable().catch(() => {});
        const stream = localParticipantRef.current?.audioStream;
        if (stream) {
          for (const track of stream.getAudioTracks()) {
            forceTrackEnabledLatch(track as unknown as HoldAudioTrack, true);
          }
        }
      }
    };

    applyMic();
    if (!pauseMic) return;
    const intervalId = setInterval(applyMic, 80);
    return () => {
      clearInterval(intervalId);
      if (!pauseMicRef.current && !userChosenMuteRef.current) {
        void microphone.enable().catch(() => {});
        const stream = localParticipantRef.current?.audioStream;
        if (stream) {
          for (const track of stream.getAudioTracks()) {
            forceTrackEnabledLatch(track as unknown as HoldAudioTrack, true);
          }
        }
      }
    };
  }, [pauseMic, microphone, userChosenMuteRef, call]);

  return null;
}

/**
 * Pause remote participant audio during GSM / peer hold only.
 * Does not emit call:mute — hold UI stays on "On hold" with no mute badge.
 */
export function StreamHoldAudioBridge({
  peerOnHold = false,
  systemOnHold = false,
}: {
  peerOnHold?: boolean;
  systemOnHold?: boolean;
}): null {
  const call = useCall();
  const { useRemoteParticipants } = useCallStateHooks();
  const remoteParticipants = useRemoteParticipants();
  const remoteParticipantsRef = useRef(remoteParticipants);
  remoteParticipantsRef.current = remoteParticipants;

  const peerOnHoldRef = useRef(peerOnHold);
  const systemOnHoldRef = useRef(systemOnHold);
  peerOnHoldRef.current = peerOnHold;
  systemOnHoldRef.current = systemOnHold;

  const wasPausedRef = useRef(false);

  /** Either side on hold → neither should hear the other. */
  const shouldPauseRemote = (): boolean =>
    peerOnHoldRef.current || systemOnHoldRef.current;

  useEffect(() => {
    if (!call) return;

    const listRemotes = (): StreamVideoParticipant[] => {
      const fromState = call.state?.remoteParticipants;
      if (Array.isArray(fromState) && fromState.length > 0) {
        return fromState;
      }
      return remoteParticipantsRef.current ?? [];
    };

    const forEachRemoteAudioTrack = (fn: (track: HoldAudioTrack) => void): void => {
      for (const participant of listRemotes()) {
        if (!participant || participant.isLocalParticipant) continue;
        const streams = [participant.audioStream, participant.screenShareAudioStream];
        for (const stream of streams) {
          if (!stream) continue;
          for (const track of stream.getAudioTracks()) {
            fn(track as unknown as HoldAudioTrack);
          }
        }
      }
    };

    const setRemoteVolume = (level: number): void => {
      for (const participant of listRemotes()) {
        if (!participant?.sessionId || participant.isLocalParticipant) continue;
        try {
          call.speaker.setParticipantVolume(participant.sessionId, level);
        } catch {
          // ignore
        }
      }
    };

    const silenceRemote = (): void => {
      setRemoteVolume(0);
      forEachRemoteAudioTrack(forceRemoteTrackSilent);
    };

    const restoreRemote = (): void => {
      // Never restore while hold is still active (delayed retries / effect churn).
      if (shouldPauseRemote()) {
        silenceRemote();
        return;
      }
      // RN often ignores `undefined` — use full volume after hold ends.
      setRemoteVolume(1);
      forEachRemoteAudioTrack(forceRemoteTrackAudible);
    };

    let restoreTimers: ReturnType<typeof setTimeout>[] = [];

    const clearRestoreTimers = (): void => {
      for (const timerId of restoreTimers) {
        clearTimeout(timerId);
      }
      restoreTimers = [];
    };

    const scheduleRestoreRetries = (): void => {
      clearRestoreTimers();
      restoreRemote();
      restoreTimers = [100, 400, 1000].map((ms) => setTimeout(restoreRemote, ms));
    };

    const tick = (): void => {
      const pause = shouldPauseRemote();
      if (pause) {
        clearRestoreTimers();
        silenceRemote();
        wasPausedRef.current = true;
        return;
      }
      if (wasPausedRef.current) {
        scheduleRestoreRetries();
        wasPausedRef.current = false;
      }
    };

    tick();
    // Keep forcing silence — GSM/Stream often rebinds tracks at ducked volume.
    const intervalId = setInterval(tick, shouldPauseRemote() ? 25 : 120);

    // Re-silence immediately when Stream swaps remote audio tracks mid-hold.
    const subscription = call.state.remoteParticipants$?.subscribe?.(() => {
      if (shouldPauseRemote()) {
        silenceRemote();
      }
    });

    return () => {
      clearInterval(intervalId);
      clearRestoreTimers();
      try {
        subscription?.unsubscribe?.();
      } catch {
        // ignore
      }
      // Only restore on teardown if hold already ended. Previously this restored on every
      // remoteParticipants identity change while still on hold — that leaked ducked audio.
      if (wasPausedRef.current && !shouldPauseRemote()) {
        scheduleRestoreRetries();
        wasPausedRef.current = false;
      }
    };
    // remoteParticipants intentionally omitted — kept via ref so hold silence is not
    // torn down/restored on every Stream participant emit.
  }, [call, peerOnHold, systemOnHold]);

  return null;
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
