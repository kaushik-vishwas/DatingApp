import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { hasSeenAuthWelcome } from '../services/authWelcomeStorage';
import { getForcedAppKind } from '../config/appKind';
import type { PostBrandSplashRoute, RootStackParamList } from './RootStackParamList';
import { navigationRef } from './navigationRef';
import { appLinking } from './appLinking';
import { consumePendingNotificationTap } from '../utils/incomingCallNotifications';

import ReceiverEducationScreen from '../screens/onboarding/ReceiverEducationScreen';
import BrandSplashScreen from '../screens/BrandSplashScreen';
import SplashScreen from '../screens/onboarding/SplashScreen';
import MobileLoginScreen from '../screens/auth/MobileLoginScreen';
import AuthGenderScreen from '../screens/auth/AuthGenderScreen';
import ReceiverLoginScreen from '../screens/ReceiverLoginScreen';
import UserLoginScreen from '../screens/UserLoginScreen';
import OtpScreen from '../screens/OtpScreen';
import RegisterScreen from '../screens/RegisterScreen';
import UserRegisterScreen from '../screens/UserRegisterScreen';
import ReceiverAppNavigator from './ReceiverAppNavigator';
import type { ReceiverStackParamList } from './ReceiverStackParamList';
import UnderReviewScreen from '../screens/UnderReviewScreen';
import CallerAppNavigator from './CallerAppNavigator';
import UserOnboardingFlow from './UserOnboardingFlow';
import type { UserProfile } from '../types/user';

const Stack = createNativeStackNavigator<RootStackParamList>();

function receiverSetupPhase(user: UserProfile): 'live' | 'setup' | 'edit' {
  if (user.accountStatus === 'approved' || user.accountStatus === 'pending_review') return 'live';
  if (user.accountStatus === 'pending_profile') return 'setup';
  return 'edit';
}

function receiverInitialRoute(user: UserProfile): keyof ReceiverStackParamList {
  const phase = receiverSetupPhase(user);
  if (phase === 'live') return 'ReceiverMainTabs';
  if (phase === 'edit') return 'ReceiverEditProfile';

  const genderMissing = !user.gender || String(user.gender).trim().length === 0;
  if (genderMissing) return 'ReceiverSelectGender';

  const hasCoreProfile = Boolean(user.name?.trim()) && Boolean(user.profileImage);
  const hasAudio = Boolean(user.userAudio && String(user.userAudio).trim());
  if (hasCoreProfile && !hasAudio) return 'ReceiverAutoVerification';
  return 'ReceiverOnboarding';
}

/** Stable tree so profile/audio saves do not remount and dump the user back to step 1. */
function ReceiverSignedInRoot(): React.JSX.Element {
  const { user } = useAuth();
  if (!user) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  const phase = receiverSetupPhase(user);
  return <ReceiverAppNavigator key={phase} initialRouteName={receiverInitialRoute(user)} />;
}

/** Signed-out tree: BrandSplash → welcome splash or mobile-first login. */
function SignedOutNavigator(): React.JSX.Element {
  const forcedAppKind = getForcedAppKind();
  const [ready, setReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState<PostBrandSplashRoute>('Splash');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const seen = await hasSeenAuthWelcome();
      if (!cancelled) {
        if (forcedAppKind === 'caller') {
          setInitialRoute('UserLogin');
        } else if (forcedAppKind === 'receiver') {
          setInitialRoute('ReceiverLogin');
        } else {
          setInitialRoute(seen ? 'MobileLogin' : 'Splash');
        }
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forcedAppKind]);

  if (!ready) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer<RootStackParamList> ref={navigationRef}>
      <Stack.Navigator
        initialRouteName="BrandSplash"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen
          name="BrandSplash"
          component={BrandSplashScreen}
          initialParams={{ postSplashRoute: initialRoute }}
        />
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="MobileLogin" component={MobileLoginScreen} />
        <Stack.Screen name="AuthGender" component={AuthGenderScreen} />
        <Stack.Screen name="ReceiverEducation" component={ReceiverEducationScreen} />
        <Stack.Screen name="ReceiverLogin" component={ReceiverLoginScreen} />
        <Stack.Screen name="UserLogin" component={UserLoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="UserRegister" component={UserRegisterScreen} />
        <Stack.Screen name="Otp" component={OtpScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function AppNavigator(): React.JSX.Element {
  const { bootstrapping, isSignedIn, user, loadingUser, signOut } = useAuth();
  const forcedAppKind = getForcedAppKind();

  if (bootstrapping) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!isSignedIn) {
    return <SignedOutNavigator />;
  }

  if (loadingUser && !user) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.err}>Could not load your session.</Text>
        <TouchableOpacity onPress={() => void signOut()}>
          <Text style={styles.link}>Back to login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { accountStatus, suspended } = user;
  const roleMismatch =
    (forcedAppKind === 'caller' && user.role !== 'caller') ||
    (forcedAppKind === 'receiver' && user.role !== 'receiver');

  if (roleMismatch) {
    return (
      <View style={styles.centered}>
        <Text style={styles.err}>This account type is not allowed in this app.</Text>
        <TouchableOpacity onPress={() => void signOut()}>
          <Text style={styles.link}>Back to login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <NavigationContainer<RootStackParamList>
      ref={navigationRef}
      linking={appLinking}
      onReady={() => {
        consumePendingNotificationTap();
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user.role === 'caller' ? (
          accountStatus === 'pending_profile' ? (
            <Stack.Screen name="UserOnboardingFlow" component={UserOnboardingFlow} />
          ) : suspended ? (
            <Stack.Screen name="UnderReview" component={UnderReviewScreen} />
          ) : accountStatus === 'approved' ? (
            <Stack.Screen name="CallerApp" component={CallerAppNavigator} />
          ) : (
            <Stack.Screen name="UnderReview" component={UnderReviewScreen} />
          )
        ) : accountStatus === 'rejected' ? (
          <Stack.Screen name="UnderReview" component={UnderReviewScreen} />
        ) : (
          <Stack.Screen name="Home" component={ReceiverSignedInRoot} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  err: {
    fontSize: 16,
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  link: {
    color: '#7b2cff',
    fontWeight: '700',
    fontSize: 16,
  },
});
