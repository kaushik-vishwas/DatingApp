import * as Application from 'expo-application';
import { Platform } from 'react-native';

/** Server rejects app requests without this once APP_BLOCK_UNVERSIONED_CLIENTS is on. */
export const APP_VERSION_HEADER = 'X-App-Version';
/** Same format as native AppVersionHeader.kt: "mfr=…; model=…; os=…; sdk=…". */
export const DEVICE_HEADER = 'X-Device';

export function getAppVersionCode(): string {
  const n = Number(Application.nativeBuildVersion);
  return Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : '0';
}

function cleanDevicePart(value: unknown): string {
  return String(value ?? '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[;=]/g, ' ')
    .trim();
}

let deviceHeader: string | null = null;

export function getDeviceHeader(): string {
  if (deviceHeader != null) return deviceHeader;
  let value = '';
  if (Platform.OS === 'android') {
    const c = Platform.constants;
    value = `mfr=${cleanDevicePart(c.Manufacturer)}; model=${cleanDevicePart(c.Model)}; os=${cleanDevicePart(c.Release)}; sdk=${cleanDevicePart(c.Version)}`;
  } else {
    value = `mfr=Apple; model=; os=${cleanDevicePart(Platform.Version)}; sdk=`;
  }
  deviceHeader = value.slice(0, 120);
  return deviceHeader;
}
