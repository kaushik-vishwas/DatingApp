import type { AuthAccountType } from '../types/api';
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { CallerStackParamList } from './CallerStackParamList';
import type { ReceiverStackParamList } from './ReceiverStackParamList';

export type RootStackParamList = {
  Splash: undefined;
  RoleGate: undefined;
  ReceiverEducation: undefined;
  UserLogin: { email?: string } | undefined;
  ReceiverLogin: { email?: string } | undefined;
  ForgotPassword: { accountType: AuthAccountType };
  Register: { email?: string; phone?: string } | undefined;
  UserRegister: { email?: string } | undefined;
  Otp: { email: string; accountType: AuthAccountType };
  CompleteProfileFlow: undefined;
  UserOnboardingFlow: undefined;
  UnderReview: undefined;
  Home: NavigatorScreenParams<ReceiverStackParamList> | undefined;
  CallerApp: NavigatorScreenParams<CallerStackParamList> | undefined;
};
