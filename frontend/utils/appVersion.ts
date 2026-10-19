import * as Application from 'expo-application';

/** Server rejects app requests without this once APP_BLOCK_UNVERSIONED_CLIENTS is on. */
export const APP_VERSION_HEADER = 'X-App-Version';

export function getAppVersionCode(): string {
  const n = Number(Application.nativeBuildVersion);
  return Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : '0';
}
