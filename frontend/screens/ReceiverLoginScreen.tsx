import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';

import { AuthLoginCard } from '../components/auth/AuthLoginCard';
import { getForcedAppKind } from '../config/appKind';
import type { RootStackParamList } from '../navigation/RootStackParamList';
import { normalizeEmail } from '../utils/validation';

type Props = NativeStackScreenProps<RootStackParamList, 'ReceiverLogin'>;

export default function ReceiverLoginScreen({ navigation, route }: Props): React.JSX.Element {
  const [email, setEmail] = useState(route.params?.email ?? '');

  useEffect(() => {
    setEmail(route.params?.email ?? '');
  }, [route.params?.email]);

  const normalized = normalizeEmail(email) || undefined;
  const forcedAppKind = getForcedAppKind();
  const isReceiverOnlyApp = forcedAppKind === 'receiver';

  const resetToRoleGate = () => {
    navigation.reset({ index: 0, routes: [{ name: 'RoleGate' }] });
  };

  return (
    <AuthLoginCard
      navigation={navigation}
      email={email}
      onEmailChange={setEmail}
      logoLetter="R"
      title="Receiver sign in"
      subtitle="For call receivers — use the email and password you applied with"
      primaryRegisterLabel="dd"
      onPrimaryRegister={() => navigation.navigate('Register', { email: normalized })}
      switchLoginLabel={isReceiverOnlyApp ? undefined : 'Login as user'}
      onSwitchLogin={isReceiverOnlyApp ? undefined : () => navigation.navigate('UserLogin', { email: normalized })}
      onChooseAccountType={isReceiverOnlyApp ? undefined : resetToRoleGate}
      authAccountType="receiver"
    />
  );
}
