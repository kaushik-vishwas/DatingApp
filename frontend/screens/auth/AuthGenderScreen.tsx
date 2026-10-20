import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import {  } from 'react-native';
import { appAlert } from '../../components/ui/AppDialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SignupGenderSelection, {
  type SignupGender,
} from '../../components/auth/SignupGenderSelection';
import { useAuth } from '../../context/AuthContext';
import type { RootStackParamList } from '../../navigation/RootStackParamList';
import { authApi, getErrorMessage, saveJwt } from '../../services/api';
import {
  clearPendingReferralCode,
  getPendingReferralCode,
} from '../../utils/pendingReferral';
import { markCallerFreeTalkEligible } from '../../utils/callerFreeTalkPopupStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'AuthGender'>;

export default function AuthGenderScreen({ navigation, route }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { phone } = route.params;
  const { signIn } = useAuth();
  const [selected, setSelected] = useState<SignupGender | null>(null);
  const [loading, setLoading] = useState(false);

  const canContinue = useMemo(() => Boolean(selected), [selected]);

  const onContinue = async () => {
    if (!selected) {
      appAlert('Select gender', 'Please choose an option to continue.');
      return;
    }

    setLoading(true);
    try {
      const referralCode = (await getPendingReferralCode()) ?? undefined;
      const { data } = await authApi.completeMobileSignup({
        phone,
        gender: selected,
        ...(referralCode ? { referralCode } : {}),
      });
      if (!data?.token) {
        appAlert('Error', 'No token returned from server');
        return;
      }
      await clearPendingReferralCode();
      await saveJwt(data.token);
      if (data.user?.role === 'caller' && data.welcomeFreeTalkGranted === true) {
        await markCallerFreeTalkEligible(data.user._id);
      }
      signIn(data.token, data.user);
    } catch (e) {
      appAlert('Signup failed', getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SignupGenderSelection
      paddingTop={Math.max(insets.top, 16) + 12}
      paddingBottom={Math.max(insets.bottom, 16) + 12}
      selected={selected}
      onSelect={setSelected}
      onBack={() => navigation.goBack()}
      onContinue={() => void onContinue()}
      continueDisabled={!canContinue || loading}
      continueLabel={loading ? 'Creating account…' : 'Continue'}
      onLogout={() => navigation.navigate('MobileLogin')}
    />
  );
}
