import type { VoiceBootstrapResponse } from '../types/api';

export type ReceiverStackParamList = {
  ReceiverHome: undefined;
  ReceiverQueue:
    | {
        peerId: string;
        peerName: string;
        peerImage?: string | null;
      }
    | undefined;
  ReceiverSettings: undefined;
  ReceiverNotifications: undefined;
  ReceiverBankDetails: undefined;
  ReceiverEditProfile: undefined;
  ReceiverProfilePreview: undefined;
  ReceiverDeleteAccount: undefined;
  ReceiverEarningsBreakdown: undefined;
  ReceiverEarningsAnalytics: undefined;
  WithdrawEarnings: undefined;
  ReceiverCallHistory: undefined;
  ReceiverChats: undefined;
  ReceiverChat: { userId: string; userName: string; userImage?: string | null };
  VoiceCall: VoiceBootstrapResponse & { peerName: string; peerImage?: string | null };
};
