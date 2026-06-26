import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type IncomingCallTapEnhanceResult = {
  applied?: boolean;
  failureReason?: string | null;
  notificationTag?: string;
  notificationId?: number;
  overlayCollapsedBound?: boolean;
  overlayExpandedBound?: boolean;
  titleCollapsedBound?: boolean;
  bodyCollapsedBound?: boolean;
  titleExpandedBound?: boolean;
  bodyExpandedBound?: boolean;
  rootCollapsedBound?: boolean;
  rootExpandedBound?: boolean;
  contentIntentWrapped?: boolean;
  openButtonPreserved?: boolean;
  openButtonWrapped?: boolean;
  usedDecoratedStyle?: boolean;
};

export type SamsungCallCompatProfile = {
  isSamsung?: boolean;
  oneUiVersion?: number;
  isSamsungOneUi6OrNewer?: boolean;
  sdkInt?: number;
  manufacturer?: string;
  model?: string;
};

export type IncomingCallAndroidModule = {
  ensureIncomingCallChannelAsync(): Promise<{ ensured?: boolean }>;
  applyFullScreenIntentAsync(
    identifier: string,
    debugEnabled: boolean
  ): Promise<IncomingCallTapEnhanceResult>;
  getSamsungCallCompatProfile(): SamsungCallCompatProfile;
  startCellularCallHoldWatch(): boolean;
  stopCellularCallHoldWatch(): void;
  refreshCellularCallHoldTelephony(): boolean;
  startCallWebSocketForegroundService(callLabel: string): boolean;
  stopCallWebSocketForegroundService(): void;
  requestIgnoreBatteryOptimizationsAsync(): Promise<{
    requested?: boolean;
    alreadyIgnored?: boolean;
    unavailable?: boolean;
  }>;
  startTelephonyDiagnosticsWatch(): boolean;
  stopTelephonyDiagnosticsWatch(): void;
  isBluetoothVoiceOutputAvailable(): boolean;
  setVoiceCallAudioRoute(route: 'speaker' | 'earpiece' | 'bluetooth'): {
    applied?: boolean;
    route?: string;
  };
  releaseVoiceCallAudioRoute(): void;
};

let cachedModule: IncomingCallAndroidModule | null | undefined;

/** Lazy native binding — safe when running in Expo Go or before Android rebuild. */
export function getIncomingCallAndroidNativeModule(): IncomingCallAndroidModule | null {
  if (Platform.OS !== 'android') return null;
  if (cachedModule !== undefined) return cachedModule;
  try {
    cachedModule = requireNativeModule<IncomingCallAndroidModule>('IncomingCallAndroid');
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

function unavailableMethod(name: string): (...args: unknown[]) => unknown {
  return (..._args: unknown[]) => {
    if (name === 'isBluetoothVoiceOutputAvailable') return false;
    if (name.startsWith('start')) return false;
    if (name === 'stopCellularCallHoldWatch' || name === 'stopCallWebSocketForegroundService') return undefined;
    if (name === 'releaseVoiceCallAudioRoute') return undefined;
    if (name.endsWith('Async')) {
      return Promise.resolve({ applied: false, unavailable: true });
    }
    return undefined;
  };
}

const defaultExport = new Proxy({} as IncomingCallAndroidModule, {
  get(_target, prop: string | symbol) {
    if (typeof prop !== 'string') return undefined;
    const mod = getIncomingCallAndroidNativeModule();
    if (!mod) return unavailableMethod(prop);
    const value = mod[prop as keyof IncomingCallAndroidModule];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(mod) : value;
  },
});

export default defaultExport;
