import { callApi } from '../services/api';

export type VoiceSessionStartPayload = {
  ok: boolean;
  talkStartedAt: string | null;
  talkActive: boolean;
  callRatePerMinute?: number;
  callerWalletBalanceInr?: number;
};

const inflightByKey = new Map<string, Promise<VoiceSessionStartPayload>>();

function sessionStartKey(callId: string, peerAccountId: string): string {
  return `${callId.trim()}:${peerAccountId.trim()}`;
}

/** Single in-flight session/start per call+peer (avoids duplicate heavy API work). */
export function getVoiceSessionStartPromise(
  callId: string,
  peerAccountId: string
): Promise<VoiceSessionStartPayload> {
  const id = callId.trim();
  const peerId = peerAccountId.trim();
  if (!id || !peerId) {
    return Promise.reject(new Error('Missing callId or peerId'));
  }
  const key = sessionStartKey(id, peerId);
  const existing = inflightByKey.get(key);
  if (existing) return existing;

  const promise = callApi
    .sessionStart(id, peerId)
    .then(({ data }) => data)
    .finally(() => {
      inflightByKey.delete(key);
    });
  inflightByKey.set(key, promise);
  return promise;
}

/** Fire-and-forget: register this party as joined so talk timer can start when both sides report in. */
export function prefetchVoiceSessionStart(callId: string, peerAccountId: string): void {
  void getVoiceSessionStartPromise(callId, peerAccountId).catch(() => {
    // VoiceCallScreen retries via sync / Stream bridge.
  });
}

export function clearVoiceSessionStartInflight(callId?: string): void {
  const id = callId?.trim();
  if (!id) {
    inflightByKey.clear();
    return;
  }
  for (const key of inflightByKey.keys()) {
    if (key.startsWith(`${id}:`)) {
      inflightByKey.delete(key);
    }
  }
}
