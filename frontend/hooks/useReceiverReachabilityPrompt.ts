import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  acknowledgeAutostart,
  getReceiverReachabilityStatus,
  missingReachabilityChecks,
  promptReachabilityFix,
  type ReachabilityCheckId,
  type ReachabilityStatus,
} from '../utils/receiverReachability';

const RESUME_DEBOUNCE_MS = 800;
/** Some fixes (e.g. FCM token on devices with broken Play Services) can hang; never lock the prompt. */
const FIX_BUSY_MAX_MS = 8000;

/** "Not now" hides the prompt for this long, across minimize / app kill / relaunch. */
const SNOOZE_MS = 6 * 60 * 60 * 1000;
const SNOOZE_UNTIL_KEY = 'selecto_receiver_reachability_snooze_until_v1';

let snoozeUntilCache: number | null = null;

async function readSnoozeUntil(): Promise<number> {
  if (snoozeUntilCache != null) return snoozeUntilCache;
  try {
    const raw = await AsyncStorage.getItem(SNOOZE_UNTIL_KEY);
    const n = Number(raw);
    snoozeUntilCache = Number.isFinite(n) ? n : 0;
  } catch {
    snoozeUntilCache = 0;
  }
  return snoozeUntilCache;
}

function snoozePrompt(): void {
  snoozeUntilCache = Date.now() + SNOOZE_MS;
  void AsyncStorage.setItem(SNOOZE_UNTIL_KEY, String(snoozeUntilCache)).catch(() => {});
}

/**
 * Read-only reachability check on home focus and every app resume. Shows the prompt only while
 * the home screen is focused (a pushed call screen blurs it), the app is active, and something is missing.
 */
export function useReceiverReachabilityPrompt(enabled: boolean): {
  visible: boolean;
  status: ReachabilityStatus | null;
  missing: ReachabilityCheckId[];
  busy: boolean;
  onFix: (id: ReachabilityCheckId) => void;
  onAcknowledgeAutostart: () => void;
  onRetry: () => void;
  onClose: () => void;
} {
  const isFocused = useIsFocused();
  const focusedRef = useRef(isFocused);
  focusedRef.current = isFocused;
  const runIdRef = useRef(0);
  const [status, setStatus] = useState<ReachabilityStatus | null>(null);
  const [missing, setMissing] = useState<ReachabilityCheckId[]>([]);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    const runId = ++runIdRef.current;
    if (!enabled || Date.now() < (await readSnoozeUntil())) {
      if (runId === runIdRef.current) setMissing([]);
      return;
    }
    try {
      const next = await getReceiverReachabilityStatus();
      if (runId !== runIdRef.current) return;
      setStatus(next);
      setMissing(missingReachabilityChecks(next));
    } catch {
      if (runId === runIdRef.current) setMissing([]);
    }
  }, [enabled]);

  useFocusEffect(
    useCallback(() => {
      void check();
    }, [check])
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active' || !focusedRef.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void check();
      }, RESUME_DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [check]);

  const onFix = useCallback(
    (id: ReachabilityCheckId) => {
      setBusy(true);
      void promptReachabilityFix(id)
        .catch(() => {})
        .finally(() => {
          setBusy(false);
          void check();
        });
    },
    [check]
  );

  const onAcknowledgeAutostart = useCallback(() => {
    void acknowledgeAutostart().finally(() => void check());
  }, [check]);

  const onClose = useCallback(() => {
    snoozePrompt();
    runIdRef.current += 1;
    setMissing([]);
  }, []);

  const visible = enabled && isFocused && missing.length > 0 && AppState.currentState === 'active';

  return {
    visible,
    status,
    missing,
    busy,
    onFix,
    onAcknowledgeAutostart,
    onRetry: () => void check(),
    onClose,
  };
}
