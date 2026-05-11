import type { VoiceBootstrapResponse } from '../types/api';

export type IncomingCallParams = {
  callId: string;
  fromType: 'u' | 'r';
  fromId: string;
  peerName: string;
  peerImage?: string | null;
};

export type ReceiverStackParamList = {
  ReceiverHome: undefined;
  ReceiverSettings: undefined;
  ReceiverNotifications: undefined;
  ReceiverBankDetails: undefined;
  ReceiverEditProfile: { fromWithdrawKyc?: boolean } | undefined;
  ReceiverAutoVerification: undefined;
  ReceiverProfilePreview: undefined;
  ReceiverDeleteAccount: undefined;
  ReceiverEarningsBreakdown: undefined;
  ReceiverEarningsAnalytics: undefined;
  WithdrawEarnings: undefined;
  ReceiverCallHistory: undefined;
  ReceiverChats: undefined;
  ReceiverChat: { userId: string; userName: string; userImage?: string | null };
  IncomingCall: IncomingCallParams;
  VoiceCall: VoiceBootstrapResponse & { peerName: string; peerImage?: string | null };
};
