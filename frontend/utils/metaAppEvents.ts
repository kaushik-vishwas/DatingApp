import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

const LOGGED_PAYMENTS_KEY = '@selecto/meta_purchase_payment_ids_v1';
const MAX_STORED_PAYMENT_IDS = 200;

const loggedPaymentIds = new Set<string>();
const inFlightPaymentIds = new Set<string>();

export type MetaWalletPurchaseParams = {
  razorpayPaymentId: string;
  /** Amount the user actually paid (INR), not credited/bonus talktime. */
  payAmountInr: number;
  /** Wallet pack amount used as the package identifier. */
  walletAmount: number;
};

type AppEventsLoggerModule = {
  logPurchase: (
    purchaseAmount: number,
    currencyCode: string,
    parameters?: Record<string, string | number>
  ) => void;
};

function walletPackageContentId(walletAmount: number): string {
  return `wallet_${Math.round(walletAmount)}`;
}

function isMetaNativeAvailable(): boolean {
  return Boolean(NativeModules.FBAppEventsLogger);
}

function loadAppEventsLogger(): AppEventsLoggerModule | null {
  if (Platform.OS === 'web' || !isMetaNativeAvailable()) return null;
  try {
    // Lazy require so Expo Go / unlinked native builds do not crash at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-fbsdk-next') as {
      AppEventsLogger?: AppEventsLoggerModule;
    };
    return mod.AppEventsLogger ?? null;
  } catch {
    return null;
  }
}

async function readLoggedPaymentIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(LOGGED_PAYMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

async function rememberLoggedPaymentId(paymentId: string): Promise<void> {
  const existing = await readLoggedPaymentIds();
  const next = [paymentId, ...existing.filter((id) => id !== paymentId)].slice(
    0,
    MAX_STORED_PAYMENT_IDS
  );
  await AsyncStorage.setItem(LOGGED_PAYMENTS_KEY, JSON.stringify(next));
}

/**
 * Logs Meta's standard Purchase event after a confirmed Razorpay wallet top-up.
 * Never throws — tracking failures must not affect payment success.
 */
export async function logMetaWalletPurchase(params: MetaWalletPurchaseParams): Promise<void> {
  try {
    const paymentId = String(params.razorpayPaymentId ?? '').trim();
    const payAmount = Number(params.payAmountInr);
    const walletAmount = Number(params.walletAmount);
    if (
      !paymentId ||
      !Number.isFinite(payAmount) ||
      payAmount <= 0 ||
      !Number.isFinite(walletAmount) ||
      walletAmount <= 0
    ) {
      return;
    }
    if (loggedPaymentIds.has(paymentId) || inFlightPaymentIds.has(paymentId)) {
      return;
    }
    inFlightPaymentIds.add(paymentId);

    const stored = await readLoggedPaymentIds();
    if (stored.includes(paymentId)) {
      loggedPaymentIds.add(paymentId);
      return;
    }

    // Persist before the native call so retries / idempotent verify cannot double-fire.
    await rememberLoggedPaymentId(paymentId);
    loggedPaymentIds.add(paymentId);

    const logger = loadAppEventsLogger();
    if (!logger?.logPurchase) return;

    logger.logPurchase(payAmount, 'INR', {
      fb_content_id: walletPackageContentId(walletAmount),
      fb_content_type: 'product',
    });
  } catch {
    // Ignore Meta / storage errors so a successful Selecto payment is never blocked.
  } finally {
    const paymentId = String(params.razorpayPaymentId ?? '').trim();
    if (paymentId) inFlightPaymentIds.delete(paymentId);
  }
}
