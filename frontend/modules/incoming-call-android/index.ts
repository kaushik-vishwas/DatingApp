import { requireNativeModule } from 'expo-modules-core';

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
  applyFullScreenIntentAsync(
    identifier: string,
    debugEnabled: boolean
  ): Promise<IncomingCallTapEnhanceResult>;
  getSamsungCallCompatProfile(): SamsungCallCompatProfile;
  startCellularCallHoldWatch(): boolean;
  stopCellularCallHoldWatch(): void;
  startCallWebSocketForegroundService(callLabel: string): boolean;
  stopCallWebSocketForegroundService(): void;
  requestIgnoreBatteryOptimizationsAsync(): Promise<{
    requested?: boolean;
    alreadyIgnored?: boolean;
    unavailable?: boolean;
  }>;
  startTelephonyDiagnosticsWatch(): boolean;
  stopTelephonyDiagnosticsWatch(): void;
};

export default requireNativeModule<IncomingCallAndroidModule>('IncomingCallAndroid');
