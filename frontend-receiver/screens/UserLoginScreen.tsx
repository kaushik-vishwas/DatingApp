import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';

import { AuthLoginCard } from '../components/auth/AuthLoginCard';
import { getForcedAppKind } from '../config/appKind';
import type { RootStackParamList } from '../navigation/RootStackParamList';
import { normalizeEmail } from '../utils/validation';

type Props = NativeStackScreenProps<RootStackParamList, 'UserLogin'>;

export default function UserLoginScreen({ navigation, route }: Props): React.JSX.Element {
  const [email, setEmail] = useState(route.params?.email ?? '');

  useEffect(() => {
    setEmail(route.params?.email ?? '');
  }, [route.params?.email]);

  const normalized = normalizeEmail(email) || undefined;
  const forcedAppKind = getForcedAppKind();
  const isCallerOnlyApp = forcedAppKind === 'caller';

  const resetToRoleGate = () => {
    navigation.reset({ index: 0, routes: [{ name: 'RoleGate' }] });
  };

  return (
    <AuthLoginCard
      navigation={navigation}
      email={email}
      onEmailChange={setEmail}
      logoLetter="U"
      title="User sign in"
      subtitle="For app members — use the email and password you registered with"
      primaryRegisterLabel="Create an account"
      onPrimaryRegister={() => navigation.navigate('UserRegister', { email: normalized })}
      switchLoginLabel={isCallerOnlyApp ? undefined : 'Login as receiver'}
      onSwitchLogin={isCallerOnlyApp ? undefined : () => navigation.navigate('ReceiverLogin', { email: normalized })}
      onChooseAccountType={isCallerOnlyApp ? undefined : resetToRoleGate}
      authAccountType="user"
    />
  );
}
