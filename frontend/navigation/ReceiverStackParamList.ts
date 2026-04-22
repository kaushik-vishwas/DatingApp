import type { VoiceBootstrapResponse } from '../types/api';

export type ReceiverStackParamList = {
  ReceiverHome: undefined;
  ReceiverChats: undefined;
  ReceiverChat: { userId: string; userName: string; userImage?: string | null };
  VoiceCall: VoiceBootstrapResponse & { peerName: string };
};
