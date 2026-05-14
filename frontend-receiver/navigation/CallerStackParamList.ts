import type { DiscoverReceiverSummary } from '../types/api';
import type { VoiceCallScreenParams } from './voiceCallParams';

export type CallerStackParamList = {
  CallerDiscover: undefined;
  CallerCalls: undefined;
  CallerAlerts: undefined;
  CallerProfile: undefined;
  CallerEditProfile: undefined;
  CallerTerms: undefined;
  CallerPrivacyPolicy: undefined;
  CallerHelp: undefined;
  CallerChats: undefined;
  CallerChat: {
    receiverId: string;
    receiverName: string;
    receiverImage?: string | null;
  };
  VoiceCall: VoiceCallScreenParams;
  ReceiverProfile: { receiver: DiscoverReceiverSummary };
  Wallet: undefined;
  PaymentMethod: { payAmount: number; bonusPercent: number; creditAmount: number };
  WalletSuccess: { creditAdded: number; newBalance: number };
};
