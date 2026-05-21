import type { VoiceBootstrapResponse } from '../types/api';

/** Caller outbound: shown before Stream bootstrap is available. */
export type VoiceCallOutgoingRingingParams = {
  outgoingCallerPhase: 'ringing';
  peerAccountId: string;
  peerName: string;
  peerImage?: string | null;
  receiverRatePerMinuteHint?: number;
  receiverEarningRatePerMinuteHint?: number;
};

export type VoiceCallActiveParams = VoiceBootstrapResponse & {
  peerName: string;
  peerImage?: string | null;
  /** Caller: wait for invite accept before joining Stream. Omitted for receiver / direct join. */
  outgoingCallerPhase?: 'joining';
};

/** Receiver turned availability on — one screen for waiting, incoming, connecting, and active call. */
export type VoiceCallReceiverAvailabilityParams = {
  receiverAvailabilitySession: true;
  peerName?: string;
  peerImage?: string | null;
};

export type VoiceCallScreenParams =
  | VoiceCallOutgoingRingingParams
  | VoiceCallActiveParams
  | VoiceCallReceiverAvailabilityParams
  | (VoiceCallActiveParams & VoiceCallReceiverAvailabilityParams);

export function isReceiverAvailabilitySession(
  params: VoiceCallScreenParams
): params is VoiceCallReceiverAvailabilityParams | (VoiceCallActiveParams & VoiceCallReceiverAvailabilityParams) {
  return 'receiverAvailabilitySession' in params && Boolean(params.receiverAvailabilitySession);
}
