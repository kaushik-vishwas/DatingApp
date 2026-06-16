import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import {
  startAndroidCellularCallHoldWatch,
  stopAndroidCellularCallHoldWatch,
  subscribeAndroidCellularCallHold,
} from '../../utils/androidCellularCallHold';
import { callDiag, setGsmInterruptPending } from '../../utils/callDiagnostics';
import { markGsmTimeline } from '../../utils/gsmDisconnectProbe';
import { isSamsungOneUi6OrNewer } from '../../utils/samsungCallCompat';

const AUDIO_MODE_IN_CALL = 2;
const AUDIO_MODE_IN_COMMUNICATION = 3;

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
    if (!enabled || Platform.OS !== 'android') {
      return;
    }

    const unsubCellular = subscribeAndroidCellularCallHold(({ active, audioMode, source }) => {
      const modeLabel =
        audioMode === AUDIO_MODE_IN_CALL
          ? 'MODE_IN_CALL'
          : audioMode === AUDIO_MODE_IN_COMMUNICATION
            ? 'MODE_IN_COMMUNICATION'
            : `mode_${audioMode ?? 'unknown'}`;
      const samsung = isSamsungOneUi6OrNewer();
      if (active) {
        setGsmInterruptPending(true);
        markGsmTimeline('T0_gsm_arrived');
        markGsmTimeline('T1_audio_focus_lost');
        callDiag.gsmDetected({ audioMode, modeLabel, source, samsung });
        callDiag.gsmAnswered({ audioMode, modeLabel, source, samsung });
        applyHoldState(true);
        return;
      }
      setGsmInterruptPending(false);
      markGsmTimeline('T6_gsm_ended');
      callDiag.gsmEnded({ audioMode, modeLabel, source, samsung });
      applyHoldState(false);
    });
    startAndroidCellularCallHoldWatch();

    return () => {
      unsubCellular();
      stopAndroidCellularCallHoldWatch();
      holdActiveRef.current = false;
    };
  }, [enabled]);

  return null;
}
