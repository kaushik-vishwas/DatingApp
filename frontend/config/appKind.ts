import Constants from 'expo-constants';

export type ForcedAppKind = 'caller' | 'receiver' | null;

export function getForcedAppKind(): ForcedAppKind {
  const c = Constants as { expoConfig?: { extra?: { appKind?: unknown } }; manifest?: { extra?: { appKind?: unknown } } };
  const raw = c.expoConfig?.extra?.appKind ?? c.manifest?.extra?.appKind;
  if (raw === 'caller' || raw === 'receiver') return raw;
  return null;
}

