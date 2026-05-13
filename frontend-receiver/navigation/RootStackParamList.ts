import type { AuthAccountType } from '../types/api';
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { CallerStackParamList } from './CallerStackParamList';
import type { ReceiverStackParamList } from './ReceiverStackParamList';

/** First screen after animated brand splash (same destinations the app used before BrandSplash existed). */
export type PostBrandSplashRoute = 'Splash' | 'RoleGate' | 'UserLogin' | 'ReceiverLogin';

export type RootStackParamList = {
  BrandSplash: { postSplashRoute: PostBrandSplashRoute };
  Splash: undefined;
  RoleGate: undefined;
  ReceiverEducation: undefined;
  UserLogin: { mobile?: string } | undefined;
  ReceiverLogin: { mobile?: string } | undefined;
  ForgotPassword: { accountType: AuthAccountType };
  Register: { email?: string; phone?: string } | undefined;
  UserRegister: { email?: string; mobile?: string } | undefined;
  Otp: { phone: string; accountType: AuthAccountType };
  CompleteProfileFlow: undefined;
  UserOnboardingFlow: undefined;
  UnderReview: undefined;
  Home: NavigatorScreenParams<ReceiverStackParamList> | undefined;
  CallerApp: NavigatorScreenParams<CallerStackParamList> | undefined;
};
