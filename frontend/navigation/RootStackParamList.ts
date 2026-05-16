import type { AuthAccountType } from '../types/api';
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { CallerStackParamList } from './CallerStackParamList';
import type { ReceiverStackParamList } from './ReceiverStackParamList';

/** First screen after animated brand splash. */
export type PostBrandSplashRoute = 'Splash' | 'MobileLogin' | 'UserLogin' | 'ReceiverLogin';

export type RootStackParamList = {
  BrandSplash: { postSplashRoute: PostBrandSplashRoute };
  Splash: undefined;
  MobileLogin: undefined;
  AuthGender: { phone: string };
  RoleGate: undefined;
  ReceiverEducation: undefined;
  UserLogin: { mobile?: string } | undefined;
  ReceiverLogin: { mobile?: string } | undefined;
  Register: { phone?: string } | undefined;
  UserRegister: { mobile?: string } | undefined;
  Otp: { phone: string; accountType: AuthAccountType };
  CompleteProfileFlow: undefined;
  UserOnboardingFlow: undefined;
  UnderReview: undefined;
  Home: NavigatorScreenParams<ReceiverStackParamList> | undefined;
  CallerApp: NavigatorScreenParams<CallerStackParamList> | undefined;
};
