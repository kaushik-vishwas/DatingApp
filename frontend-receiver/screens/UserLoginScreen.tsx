import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';

import { AuthLoginCard } from '../components/auth/AuthLoginCard';
import { getForcedAppKind } from '../config/appKind';
import type { RootStackParamList } from '../navigation/RootStackParamList';
import { normalizeIndianMobileDigits } from '../utils/validation';

type Props = NativeStackScreenProps<RootStackParamList, 'UserLogin'>;

export default function UserLoginScreen({ navigation, route }: Props): React.JSX.Element {
  const [mobile, setMobile] = useState(route.params?.mobile ?? '');

  useEffect(() => {
    setMobile(route.params?.mobile ?? '');
  }, [route.params?.mobile]);

  const normalizedMobile = normalizeIndianMobileDigits(mobile);
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
      logoLetter="U"
      title="User sign in"
      subtitle="For app members — sign in with your registered mobile number"
      primaryRegisterLabel="Create an account"
      onPrimaryRegister={() => navigation.navigate('UserRegister', { mobile: normalizedMobile || undefined })}
      switchLoginLabel={isCallerOnlyApp ? undefined : 'Login as receiver'}
      onSwitchLogin={isCallerOnlyApp ? undefined : () => navigation.navigate('ReceiverLogin', { mobile: normalizedMobile })}
      onChooseAccountType={isCallerOnlyApp ? undefined : resetToRoleGate}
      authAccountType="user"
    />
  );
}
