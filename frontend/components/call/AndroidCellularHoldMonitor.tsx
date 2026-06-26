import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import {
  ensureAndroidReadPhoneStatePermission,
  refreshAndroidCellularCallHoldWatch,
  startAndroidCellularCallHoldWatch,
  stopAndroidCellularCallHoldWatch,
  subscribeAndroidCellularCallHold,
} from '../../utils/androidCellularCallHold';
import { callDiag, setGsmInterruptPending } from '../../utils/callDiagnostics';
import { isIncomingCallNativeAvailable } from '../../utils/incomingCallNativeBridge';
import { markGsmTimeline } from '../../utils/gsmDisconnectProbe';
import { isSamsungOneUi6OrNewer } from '../../utils/samsungCallCompat';

const AUDIO_MODE_IN_CALL = 2;
const AUDIO_MODE_IN_COMMUNICATION = 3;

/** Hold only after cellular call is answered — not on ring or audio-mode hints alone. */
function isAnsweredCellularHold(active: boolean, source?: string): boolean {
  if (!active) return false;
  const s = (source ?? '').toLowerCase();
  if (s === 'preemptive_ring' || s === 'telephony_ringing' || s === 'poll' || s === 'start') {
    return false;
  }
  return (
    s === 'telephony_offhook' ||
    s === 'telephony_state' ||
    s === 'audio_mode' ||
    s === 'audio_focus_loss' ||
    s === 'phone_state_broadcast' ||
    s === 'telephony_callback' ||
    s === 'telephony_legacy'
  );
}

/**
 * Detects external cellular calls via Android audio mode (independent of Stream JOINED state).
 * Stream can leave JOINED during GSM — hold must still apply and notify the peer.
 */
export function AndroidCellularHoldMonitor({
  enabled,
  onSystemHoldChange,
}: {
  enabled: boolean;
  onSystemHoldChange: (onHold: boolean) => void;
}): null {
  const onSystemHoldChangeRef = useRef(onSystemHoldChange);
  const holdActiveRef = useRef(false);
  onSystemHoldChangeRef.current = onSystemHoldChange;

  const applyHoldState = (next: boolean, details?: Record<string, unknown>): void => {
    if (next) {
      if (holdActiveRef.current) return;
      holdActiveRef.current = true;
      callDiag.holdStarted('local_system', details);
      callDiag.info('cellular_hold_monitor_on', details ?? {});
      setGsmInterruptPending(true);
      markGsmTimeline('T0_gsm_arrived');
      markGsmTimeline('T1_audio_focus_lost');
      onSystemHoldChangeRef.current(true);
      return;
    }
    if (!holdActiveRef.current) return;
    holdActiveRef.current = false;
    callDiag.holdEnded('local_system', details);
    callDiag.info('cellular_hold_monitor_off', details ?? {});
    setGsmInterruptPending(false);
    markGsmTimeline('T6_gsm_ended');
    onSystemHoldChangeRef.current(false);
  };

  useEffect(() => {
    if (!enabled || Platform.OS !== 'android') {
      if (Platform.OS === 'android') {
        callDiag.info('cellular_hold_monitor_disabled', { enabled });
      }
      return;
    }

    callDiag.info('cellular_hold_monitor_enabling', {
      nativeAvailable: isIncomingCallNativeAvailable(),
    });

    let cancelled = false;
    void (async () => {
      const granted = await ensureAndroidReadPhoneStatePermission();
      if (cancelled) return;
      callDiag.info('cellular_hold_permission', { readPhoneStateGranted: granted });
      if (granted) {
        refreshAndroidCellularCallHoldWatch();
      }
    })();

    const unsubCellular = subscribeAndroidCellularCallHold(({ active, audioMode, source }) => {
      const modeLabel =
        audioMode === AUDIO_MODE_IN_CALL
          ? 'MODE_IN_CALL'
          : audioMode === AUDIO_MODE_IN_COMMUNICATION
            ? 'MODE_IN_COMMUNICATION'
            : `mode_${audioMode ?? 'unknown'}`;
      const samsung = isSamsungOneUi6OrNewer();
      const details = { audioMode, modeLabel, source, samsung, path: 'native_cellular' };

      if (active) {
        if (!isAnsweredCellularHold(true, source)) {
          callDiag.info('cellular_hold_ignored_pre_answer', details);
          return;
        }
        callDiag.gsmDetected(details);
        callDiag.gsmAnswered(details);
        applyHoldState(true, details);
        return;
      }

      callDiag.gsmEnded(details);
      applyHoldState(false, details);
    });

    startAndroidCellularCallHoldWatch();

    return () => {
      cancelled = true;
      unsubCellular();
      stopAndroidCellularCallHoldWatch();
      holdActiveRef.current = false;
      callDiag.info('cellular_hold_watch_stopped', {});
    };
  }, [enabled]);

  return null;
}
