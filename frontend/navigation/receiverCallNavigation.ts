import type { NavigationState, PartialState } from '@react-navigation/native';
import { getRootNavigation } from './navigationRef';
import type { VoiceCallScreenParams } from './voiceCallParams';

export type ReceiverCallRoute =
  | { name: 'IncomingCall'; callId: string }
  | { name: 'VoiceCall'; callId: string | null };

function callIdFromVoiceCallParams(params: unknown): string | null {
  if (!params || typeof params !== 'object') return null;
  const p = params as VoiceCallScreenParams;
  if ('callId' in p && typeof (p as { callId?: unknown }).callId === 'string') {
    const id = (p as { callId: string }).callId.trim();
    return id || null;
  }
  return null;
}

function findReceiverCallRoute(
  state: NavigationState | PartialState<NavigationState> | undefined
): ReceiverCallRoute | null {
  if (!state?.routes?.length) return null;

  let found: ReceiverCallRoute | null = null;
  for (const route of state.routes) {
    if (route.name === 'IncomingCall') {
      const callId =
        route.params &&
        typeof route.params === 'object' &&
        typeof (route.params as { callId?: unknown }).callId === 'string'
          ? (route.params as { callId: string }).callId.trim()
          : '';
      if (callId) found = { name: 'IncomingCall', callId };
    }
    if (route.name === 'VoiceCall') {
      found = { name: 'VoiceCall', callId: callIdFromVoiceCallParams(route.params) };
    }
    const nested = findReceiverCallRoute(route.state as NavigationState | undefined);
    if (nested) found = nested;
  }
  return found;
}

export function getReceiverActiveCallRoute(): ReceiverCallRoute | null {
  const nav = getRootNavigation();
  if (!nav) return null;
  try {
    return findReceiverCallRoute(nav.getState());
  } catch {
    return null;
  }
}

/** True when IncomingCall must not be opened (already ringing this invite, or already on VoiceCall). */
export function isReceiverAlreadyOnCallScreen(callId: string): boolean {
  const id = callId.trim();
  if (!id) return false;
  const active = getReceiverActiveCallRoute();
  if (!active) return false;
  if (active.name === 'IncomingCall' && active.callId === id) return true;
  if (active.name === 'VoiceCall') {
    if (!active.callId) return true;
    return active.callId === id;
  }
  return false;
}

export function isReceiverOnVoiceCallScreen(): boolean {
  return getReceiverActiveCallRoute()?.name === 'VoiceCall';
}
