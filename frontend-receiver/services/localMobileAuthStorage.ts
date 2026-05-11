import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AuthAccountType } from '../types/api';
import { normalizeIndianMobileDigits } from '../utils/validation';

const REGISTRY_KEY = 'local_mobile_otp_auth_registry_v1';
const PENDING_OTP_REGISTRATION_KEY = 'local_pending_registration_otp_v1';

type CredentialRow = { email: string; password: string };

type RegistryFile = {
  receiver: Record<string, CredentialRow>;
  user: Record<string, CredentialRow>;
};

export type PendingOtpRegistration = {
  phoneDigits: string;
  email: string;
  password: string;
  accountType: AuthAccountType;
};

function emptyRegistry(): RegistryFile {
  return { receiver: {}, user: {} };
}

async function readRegistry(): Promise<RegistryFile> {
  const raw = await AsyncStorage.getItem(REGISTRY_KEY);
  if (!raw) return emptyRegistry();
  try {
    const p = JSON.parse(raw) as Partial<RegistryFile>;
    return {
      receiver: typeof p.receiver === 'object' && p.receiver !== null ? p.receiver : {},
      user: typeof p.user === 'object' && p.user !== null ? p.user : {},
    };
  } catch {
    return emptyRegistry();
  }
}

async function writeRegistry(data: RegistryFile): Promise<void> {
  await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(data));
}

function bucketFor(accountType: AuthAccountType): 'receiver' | 'user' {
  return accountType === 'receiver' ? 'receiver' : 'user';
}

export async function registerSavedPhoneCredentials(
  phoneDigits: string,
  creds: { email: string; password: string; accountType: AuthAccountType },
): Promise<void> {
  const normalized = normalizeIndianMobileDigits(phoneDigits);
  const r = await readRegistry();
  const b = bucketFor(creds.accountType);
  r[b][normalized] = { email: creds.email.trim().toLowerCase(), password: creds.password };
  await writeRegistry(r);
}

export async function getSavedCredentialsByPhone(
  phoneDigits: string,
  accountType: AuthAccountType,
): Promise<CredentialRow | null> {
  const normalized = normalizeIndianMobileDigits(phoneDigits);
  const r = await readRegistry();
  return r[bucketFor(accountType)][normalized] ?? null;
}

export async function isPhoneRegisteredForAccountType(
  phoneDigits: string,
  accountType: AuthAccountType,
): Promise<boolean> {
  const row = await getSavedCredentialsByPhone(phoneDigits, accountType);
  return row != null;
}

export async function savePendingOtpRegistration(payload: PendingOtpRegistration): Promise<void> {
  await AsyncStorage.setItem(
    PENDING_OTP_REGISTRATION_KEY,
    JSON.stringify({
      ...payload,
      email: payload.email.trim().toLowerCase(),
      phoneDigits: normalizeIndianMobileDigits(payload.phoneDigits),
    }),
  );
}

export async function getPendingOtpRegistration(): Promise<PendingOtpRegistration | null> {
  const raw = await AsyncStorage.getItem(PENDING_OTP_REGISTRATION_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as PendingOtpRegistration;
    if (!p?.email || !p?.password || !p?.phoneDigits || (p.accountType !== 'user' && p.accountType !== 'receiver')) {
      return null;
    }
    return {
      email: p.email,
      password: p.password,
      phoneDigits: normalizeIndianMobileDigits(p.phoneDigits),
      accountType: p.accountType,
    };
  } catch {
    return null;
  }
}

export async function clearPendingOtpRegistration(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_OTP_REGISTRATION_KEY);
}
