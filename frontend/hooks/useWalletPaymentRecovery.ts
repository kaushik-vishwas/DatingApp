import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  reconcilePendingWalletCheckout,
  type PendingWalletCheckout,
  type WalletReconcileResult,
} from '../utils/pendingWalletCheckout';

type Options = {
  enabled: boolean;
  pending?: PendingWalletCheckout | null;
  onCredited?: (result: WalletReconcileResult & { status: 'credited' }) => void;
};

/**
 * When user returns from UPI / PhonePe, Razorpay WebView may miss the success callback.
 * Re-check with the server on app foreground (safe + idempotent).
 */
export function useWalletPaymentRecovery({ enabled, pending, onCredited }: Options): {
  reconcileNow: () => Promise<WalletReconcileResult>;
} {
  const busyRef = useRef(false);
  const onCreditedRef = useRef(onCredited);
  onCreditedRef.current = onCredited;

  const reconcileNow = useCallback(async (): Promise<WalletReconcileResult> => {
    if (busyRef.current) return { status: 'none' };
    busyRef.current = true;
    try {
      const result = await reconcilePendingWalletCheckout(pending);
      if (result.status === 'credited') {
        onCreditedRef.current?.(result);
      }
      return result;
    } finally {
      busyRef.current = false;
    }
  }, [pending]);

  useEffect(() => {
    if (!enabled) return;

    const onChange = (state: AppStateStatus) => {
      if (state !== 'active') return;
      void reconcileNow();
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [enabled, reconcileNow]);

  return { reconcileNow };
}
