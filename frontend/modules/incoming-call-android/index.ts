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

export type IncomingCallAndroidModule = {
  applyFullScreenIntentAsync(
    identifier: string,
    debugEnabled: boolean
  ): Promise<IncomingCallTapEnhanceResult>;
  startCellularCallHoldWatch(): boolean;
  stopCellularCallHoldWatch(): void;
};

export default requireNativeModule<IncomingCallAndroidModule>('IncomingCallAndroid');
