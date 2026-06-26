import { EventEmitter } from 'expo-modules-core';
import { Platform } from 'react-native';
import {
  getIncomingCallAndroidNativeModule,
  type IncomingCallAndroidModule,
} from '../modules/incoming-call-android';

let nativeEventEmitter: EventEmitter | null = null;

/** Real Expo native module — required for method calls AND event subscriptions. */
export function getIncomingCallNativeModule(): IncomingCallAndroidModule | null {
  if (Platform.OS !== 'android') return null;
  return getIncomingCallAndroidNativeModule();
}

export function isIncomingCallNativeAvailable(): boolean {
  return getIncomingCallNativeModule() != null;
}

/**
 * EventEmitter must wrap requireNativeModule(), not the default export Proxy.
 * Using the Proxy breaks onCellularCallStateChanged / onTelephonyDiagnostic on all devices.
 */
export function getIncomingCallNativeEventEmitter(): EventEmitter | null {
  const mod = getIncomingCallNativeModule();
  if (!mod) return null;
  if (!nativeEventEmitter) {
    nativeEventEmitter = new EventEmitter(mod);
  }
  return nativeEventEmitter;
}
