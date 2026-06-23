import type { NavigatorScreenParams } from '@react-navigation/native';
import type { DiscoverReceiverSummary } from '../types/api';
import type { CallerTabParamList } from './CallerTabParamList';
import type { VoiceCallScreenParams } from './voiceCallParams';

export type CallerStackParamList = {
  CallerMainTabs: NavigatorScreenParams<CallerTabParamList> | undefined;
  CallerProfile: undefined;
  CallerRateUs: undefined;
  CallerShareApp: undefined;
  CallerFaq: undefined;
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
  CallDiagnostics: undefined;
  PresenceDiagnostics: undefined;
  ReceiverProfile: { receiver: DiscoverReceiverSummary };
  Wallet: undefined;
  WalletTransactions: undefined;
  PaymentMethod: {
    payAmount: number;
    bonusPercent: number;
    creditAmount: number;
    gstAmount: number;
    platformFeeAmount: number;
    platformFeePercent: number;
    totalAmount: number;
    walletAmount: number;
  };
  WalletSuccess: { creditAdded: number; newBalance: number };
};
