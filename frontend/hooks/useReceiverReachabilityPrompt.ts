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

/** "Not now" lasts until the JS runtime restarts (next app launch). */
let dismissedThisSession = false;

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
    if (!enabled || dismissedThisSession) {
      setMissing([]);
      return;
    }
    const runId = ++runIdRef.current;
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
    dismissedThisSession = true;
    setMissing([]);
  }, []);

  const visible =
    enabled && !dismissedThisSession && isFocused && missing.length > 0 && AppState.currentState === 'active';

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
