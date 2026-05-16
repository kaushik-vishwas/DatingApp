import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet } from 'react-native';

import { AuthLoginCard } from '../components/auth/AuthLoginCard';
import { getForcedAppKind } from '../config/appKind';
import type { RootStackParamList } from '../navigation/RootStackParamList';
import { normalizeIndianMobileDigits } from '../utils/validation';
import SelectoLogo from '../assets/SelectoLogo.png';

type Props = NativeStackScreenProps<RootStackParamList, 'UserLogin'>;

export default function UserLoginScreen({ navigation, route }: Props): React.JSX.Element {
  const [mobile, setMobile] = useState(route.params?.mobile ?? '');

  useEffect(() => {
    setMobile(route.params?.mobile ?? '');
  }, [route.params?.mobile]);

  const normalizedMobile = normalizeIndianMobileDigits(mobile) || undefined;
  const forcedAppKind = getForcedAppKind();
  const isCallerOnlyApp = forcedAppKind === 'caller';

  const resetToRoleGate = () => {
    navigation.reset({ index: 0, routes: [{ name: 'RoleGate' }] });
  };

  return (
    <AuthLoginCard
      navigation={navigation}
      mobile={mobile}
      onMobileChange={setMobile}
      customLogo={<Image source={SelectoLogo} style={styles.logo} resizeMode="contain" />}
      title="User sign in"
      subtitle="For app members — sign in with your registered mobile number"
      primaryRegisterLabel="Create an account"
      onPrimaryRegister={() => navigation.navigate('UserRegister', { mobile: normalizedMobile })}
      switchLoginLabel={isCallerOnlyApp ? undefined : 'Login as receiver'}
      onSwitchLogin={isCallerOnlyApp ? undefined : () => navigation.navigate('ReceiverLogin', { mobile: normalizedMobile })}
      onChooseAccountType={isCallerOnlyApp ? undefined : resetToRoleGate}
      authAccountType="user"
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 150,
    height: 50,
  },
});