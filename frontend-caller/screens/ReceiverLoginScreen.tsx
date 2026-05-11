import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';

import { AuthLoginCard } from '../components/auth/AuthLoginCard';
import { getForcedAppKind } from '../config/appKind';
import type { RootStackParamList } from '../navigation/RootStackParamList';
import { normalizeIndianMobileDigits } from '../utils/validation';

type Props = NativeStackScreenProps<RootStackParamList, 'ReceiverLogin'>;

export default function ReceiverLoginScreen({ navigation, route }: Props): React.JSX.Element {
  const [mobile, setMobile] = useState(route.params?.mobile ?? '');

  useEffect(() => {
    setMobile(route.params?.mobile ?? '');
  }, [route.params?.mobile]);

  const normalizedMobile = normalizeIndianMobileDigits(mobile) || undefined;
  const forcedAppKind = getForcedAppKind();
  const isReceiverOnlyApp = forcedAppKind === 'receiver';

  const resetToRoleGate = () => {
    navigation.reset({ index: 0, routes: [{ name: 'RoleGate' }] });
  };

  return (
    <AuthLoginCard
      navigation={navigation}
      mobile={mobile}
      onMobileChange={setMobile}
      logoLetter="R"
      title="Receiver sign in"
      subtitle="For call receivers — sign in with your registered mobile number"
      primaryRegisterLabel="Register as receiver"
      onPrimaryRegister={() => navigation.navigate('Register', { phone: normalizedMobile })}
      switchLoginLabel={isReceiverOnlyApp ? undefined : 'Login as user'}
      onSwitchLogin={isReceiverOnlyApp ? undefined : () => navigation.navigate('UserLogin', { mobile: normalizedMobile })}
      onChooseAccountType={isReceiverOnlyApp ? undefined : resetToRoleGate}
      authAccountType="receiver"
    />
  );
}
