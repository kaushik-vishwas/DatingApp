import AsyncStorage from '@react-native-async-storage/async-storage';

import { getErrorMessage, walletApi } from '../services/api';
import type { WalletCreditResponse } from '../types/api';

const STORAGE_KEY = '@nesthama_pending_wallet_checkout_v1';
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

export type PendingWalletCheckout = {
  orderId: string;
  payAmount: number;
  bonusPercent: number;
  walletAmount: number;
  startedAt: number;
};

export async function savePendingWalletCheckout(checkout: PendingWalletCheckout): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(checkout));
}

export async function clearPendingWalletCheckout(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export async function readPendingWalletCheckout(): Promise<PendingWalletCheckout | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingWalletCheckout;
    if (!parsed?.orderId || typeof parsed.orderId !== 'string') return null;
    if (!Number.isFinite(parsed.payAmount) || !Number.isFinite(parsed.bonusPercent)) return null;
    if (!Number.isFinite(parsed.walletAmount)) return null;
    const startedAt = Number(parsed.startedAt) || 0;
    if (startedAt > 0 && Date.now() - startedAt > MAX_AGE_MS) {
      await clearPendingWalletCheckout();
      return null;
    }
    return {
      orderId: parsed.orderId.trim(),
      payAmount: parsed.payAmount,
      bonusPercent: parsed.bonusPercent,
      walletAmount: parsed.walletAmount,
      startedAt,
    };
  } catch {
    return null;
  }
}

export type WalletReconcileResult =
  | { status: 'none' }
  | { status: 'pending' }
  | { status: 'credited'; data: WalletCreditResponse; alreadyCredited: boolean }
  | { status: 'error'; message: string };

/** Ask server to credit from Razorpay when checkout success never reached the app. */
export async function reconcilePendingWalletCheckout(
  pending?: PendingWalletCheckout | null,
  paymentId?: string
): Promise<WalletReconcileResult> {
  const row = pending ?? (await readPendingWalletCheckout());
  if (!row) return { status: 'none' };

  try {
    const { data } = await walletApi.reconcileRazorpayPayment({
      razorpay_order_id: row.orderId,
      ...(paymentId ? { razorpay_payment_id: paymentId } : {}),
    });
    if (!data.credited) {
      return { status: 'pending' };
    }
    await clearPendingWalletCheckout();
    return {
      status: 'credited',
      data,
      alreadyCredited: Boolean(data.alreadyCredited),
    };
  } catch (e: unknown) {
    return { status: 'error', message: getErrorMessage(e, 'Could not sync payment') };
  }
}

const CONFIRM_RETRY_DELAYS_MS = [0, 2000, 4000, 6000];

/**
 * Razorpay reported success but app verify failed (network / server hiccup): the money is most
 * likely taken, so keep asking the server for ~12s before giving up. Pending checkout stays stored,
 * so Wallet screen / next app open / webhook still credit it later.
 */
export async function confirmWalletPaymentWithRetry(
  pending: PendingWalletCheckout | null,
  paymentId?: string
): Promise<WalletReconcileResult> {
  let last: WalletReconcileResult = { status: 'none' };
  for (const delayMs of CONFIRM_RETRY_DELAYS_MS) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    last = await reconcilePendingWalletCheckout(pending, paymentId);
    if (last.status === 'credited' || last.status === 'none') return last;
  }
  return last;
}

export const PAYMENT_CONFIRMING_TITLE = 'Confirming your payment';
export const PAYMENT_CONFIRMING_MESSAGE =
  "Razorpay reported your payment as successful, but we couldn't confirm it yet. If money was deducted, your wallet will be updated automatically in a few minutes — please don't pay again.\n\nYou can also tap \"Paid but balance not updated? Tap to sync\" on the Wallet screen.";
