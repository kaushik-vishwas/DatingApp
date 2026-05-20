import type { NavigatorScreenParams } from '@react-navigation/native';
import type { VoiceCallScreenParams } from './voiceCallParams';
import type { Gender } from '../types/user';
import type { ReceiverTabParamList } from './ReceiverTabParamList';

export type IncomingCallParams = {
  callId: string;
  fromType: 'u' | 'r';
  fromId: string;
  peerName: string;
  peerImage?: string | null;
};

export type ReceiverStackParamList = {
  ReceiverMainTabs: NavigatorScreenParams<ReceiverTabParamList> | undefined;
  /** Shown after turning availability on — display only; calls still work as before. */
  ReceiverAvailabilityWaiting: undefined;
  ReceiverSettings: undefined;
  ReceiverHowToEarn: undefined;
  ReceiverNotifications: undefined;
  ReceiverBankDetails: undefined;
  ReceiverEditProfile: { fromWithdrawKyc?: boolean } | undefined;
  ReceiverSelectGender: undefined;
  ReceiverOnboarding: { gender?: Gender } | undefined;
  /** @deprecated Use ReceiverOnboarding — kept for deep links / legacy navigate calls */
  ReceiverCreateProfile: { gender?: Gender } | undefined;
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
  VoiceCall: VoiceCallScreenParams;
};
