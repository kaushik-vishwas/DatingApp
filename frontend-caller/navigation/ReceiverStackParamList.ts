import type { VoiceCallScreenParams } from './voiceCallParams';

export type ReceiverStackParamList = {
  ReceiverHome: undefined;
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
  VoiceCall: VoiceCallScreenParams;
};
