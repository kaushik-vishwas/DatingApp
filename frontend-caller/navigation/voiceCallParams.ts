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

export type VoiceCallScreenParams = VoiceCallOutgoingRingingParams | VoiceCallActiveParams;
