import { requireNativeModule } from 'expo-modules-core';

export type IncomingCallAndroidModule = {
  applyFullScreenIntentAsync(identifier: string): Promise<boolean>;
  startCellularCallHoldWatch(): boolean;
  stopCellularCallHoldWatch(): void;
};

export default requireNativeModule<IncomingCallAndroidModule>('IncomingCallAndroid');
