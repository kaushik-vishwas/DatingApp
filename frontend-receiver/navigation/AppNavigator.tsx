import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { hasSeenAuthWelcome } from '../services/authWelcomeStorage';
import { getForcedAppKind } from '../config/appKind';
import type { RootStackParamList } from './RootStackParamList';
import { navigationRef } from './navigationRef';

import ReceiverEducationScreen from '../screens/onboarding/ReceiverEducationScreen';
import RoleGateScreen from '../screens/onboarding/RoleGateScreen';
import SplashScreen from '../screens/onboarding/SplashScreen';
import ReceiverLoginScreen from '../screens/ReceiverLoginScreen';
import UserLoginScreen from '../screens/UserLoginScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import OtpScreen from '../screens/OtpScreen';
import RegisterScreen from '../screens/RegisterScreen';
import UserRegisterScreen from '../screens/UserRegisterScreen';
import ReceiverAppNavigator from './ReceiverAppNavigator';
import UnderReviewScreen from '../screens/UnderReviewScreen';
import CallerAppNavigator from './CallerAppNavigator';
import CompleteProfileFlow from './CompleteProfileFlow';
import UserOnboardingFlow from './UserOnboardingFlow';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Signed-out tree: load welcome flag so logout skips Splash and opens RoleGate. */
function SignedOutNavigator(): React.JSX.Element {
  const forcedAppKind = getForcedAppKind();
  const [ready, setReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState<
    'Splash' | 'RoleGate' | 'UserLogin' | 'ReceiverLogin' | 'ReceiverEducation'
  >('Splash');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const seen = await hasSeenAuthWelcome();
      if (!cancelled) {
        if (forcedAppKind === 'caller') {
          setInitialRoute('UserLogin');
        } else if (forcedAppKind === 'receiver') {
          // Receiver-only app starts with receiver onboarding welcome flow.
          setInitialRoute('ReceiverEducation');
        } else {
          setInitialRoute(seen ? 'RoleGate' : 'Splash');
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
        initialRouteName={initialRoute}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="RoleGate" component={RoleGateScreen} />
        <Stack.Screen name="ReceiverEducation" component={ReceiverEducationScreen} />
        <Stack.Screen name="ReceiverLogin" component={ReceiverLoginScreen} />
        <Stack.Screen name="UserLogin" component={UserLoginScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
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
    <NavigationContainer<RootStackParamList> ref={navigationRef}>
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
        ) : (
          <Stack.Screen
            name="Home"
            children={() => {
              const receiverDashboardOk =
                accountStatus === 'approved' && Boolean(user.userAudio?.trim());
              return (
                <ReceiverAppNavigator
                  initialRouteName={receiverDashboardOk ? 'ReceiverHome' : 'ReceiverEditProfile'}
                />
              );
            }}
          />
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
