import { Platform } from 'react-native';
import type { ManagerOptions, SocketOptions } from 'socket.io-client';

/** Engine.IO pingTimeout — wait for pong before treating the socket as hung. */
export const ANDROID_CONNECTION_TIMEOUT_HANGING_MS = 60_000;

/** Socket.IO reconnectionDelayMax — max backoff while reconnecting. */
export const ANDROID_CONNECTION_TIMEOUT_RECONNECTING_MS = 60_000;

/** Application-level call keepalive interval between participants. */
export const ANDROID_KEEPALIVE_INTERVAL_MS = 8_000;

/** Stream call.setDisconnectionTimeout (seconds) during active calls. */
export const ANDROID_STREAM_DISCONNECTION_TIMEOUT_SEC = 60;

export function isAndroidPlatform(): boolean {
  return Platform.OS === 'android';
}

const BASE_CALL_SOCKET_IO_OPTIONS: Partial<ManagerOptions & SocketOptions> = {
  transports: ['polling', 'websocket'],
  timeout: 20_000,
  reconnection: true,
  reconnectionAttempts: 50,
  reconnectionDelay: 1_000,
  reconnectionDelayMax: 10_000,
};

const ANDROID_CALL_SOCKET_IO_OPTIONS: Partial<ManagerOptions & SocketOptions> = {
  ...BASE_CALL_SOCKET_IO_OPTIONS,
  pingInterval: ANDROID_KEEPALIVE_INTERVAL_MS,
  pingTimeout: ANDROID_CONNECTION_TIMEOUT_HANGING_MS,
  reconnectionDelayMax: ANDROID_CONNECTION_TIMEOUT_RECONNECTING_MS,
};

/**
 * Socket.IO options for call signaling. All Android devices use extended timeouts;
 * iOS and other platforms keep legacy values.
 */
export function getCallSocketIoOptions(): Partial<ManagerOptions & SocketOptions> {
  if (!isAndroidPlatform()) {
    return { ...BASE_CALL_SOCKET_IO_OPTIONS };
  }
  return { ...ANDROID_CALL_SOCKET_IO_OPTIONS };
}
