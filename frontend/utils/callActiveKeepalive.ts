import { Platform } from 'react-native';
import type { Socket } from 'socket.io-client';
import { callDiag } from './callDiagnostics';
import { ANDROID_KEEPALIVE_INTERVAL_MS } from './androidCallNetwork';
import { recordAppKeepaliveAck, recordAppKeepaliveSent } from './gsmDisconnectProbe';

type KeepaliveRegistration = {
  id: string;
  socket: Socket;
};

const LISTENER_FLAG = '__callKeepaliveListenersAttached';

let registrations: KeepaliveRegistration[] = [];
let intervalRef: ReturnType<typeof setInterval> | null = null;
let callActive = false;
let activeCallId = '';

function ensureListeners(socket: Socket): void {
  const flagged = socket as Socket & { [LISTENER_FLAG]?: boolean };
  if (flagged[LISTENER_FLAG]) return;
  flagged[LISTENER_FLAG] = true;

  socket.on('call:keepalive', (payload: { callId?: string }) => {
    const callId = typeof payload?.callId === 'string' ? payload.callId.trim() : '';
    if (!callId || !callActive || callId !== activeCallId) return;
    if (!socket.connected) return;
    try {
      socket.emit('call:keepalive:ack', { callId, ts: Date.now() });
      recordAppKeepaliveAck();
    } catch {
      // ignore
    }
  });

  socket.on('call:keepalive:ack', (payload: { callId?: string }) => {
    const callId = typeof payload?.callId === 'string' ? payload.callId.trim() : '';
    if (!callId || callId !== activeCallId) return;
    callDiag.info('call_keepalive_ack', { callId });
    recordAppKeepaliveAck();
  });
}

function emitKeepaliveTick(): void {
  if (!callActive || !activeCallId) return;
  for (const reg of registrations) {
    if (!reg.socket.connected) continue;
    try {
      reg.socket.emit('call:keepalive', { callId: activeCallId, ts: Date.now() });
      recordAppKeepaliveSent();
    } catch {
      // ignore
    }
  }
}

function stopInterval(): void {
  if (!intervalRef) return;
  clearInterval(intervalRef);
  intervalRef = null;
}

/** Register a call signaling socket for active-call keepalive (Android only). */
export function registerCallKeepaliveSocket(id: string, socket: Socket | null): void {
  if (Platform.OS !== 'android') return;
  registrations = registrations.filter((entry) => entry.id !== id);
  if (!socket) return;
  ensureListeners(socket);
  registrations.push({ id, socket });
}

export function unregisterCallKeepaliveSocket(id: string): void {
  if (Platform.OS !== 'android') return;
  registrations = registrations.filter((entry) => entry.id !== id);
  if (registrations.length === 0) {
    setCallKeepaliveActive('', false);
  }
}

/** Start/stop 8s peer keepalive while a voice call is active (Android only). */
export function setCallKeepaliveActive(callId: string, active: boolean): void {
  if (Platform.OS !== 'android') return;

  const normalized = callId.trim();
  callActive = active && normalized.length > 0;
  activeCallId = callActive ? normalized : '';

  if (!callActive) {
    stopInterval();
    callDiag.info('call_keepalive_stopped', { callId: normalized || null });
    return;
  }

  if (!intervalRef) {
    intervalRef = setInterval(emitKeepaliveTick, ANDROID_KEEPALIVE_INTERVAL_MS);
    emitKeepaliveTick();
    callDiag.info('call_keepalive_started', { callId: normalized });
  }
}

export function teardownCallKeepalive(): void {
  if (Platform.OS !== 'android') return;
  setCallKeepaliveActive('', false);
  registrations = [];
}
