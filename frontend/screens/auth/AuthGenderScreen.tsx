import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SignupGenderSelection, {
  type SignupGender,
} from '../../components/auth/SignupGenderSelection';
import { useAuth } from '../../context/AuthContext';
import type { RootStackParamList } from '../../navigation/RootStackParamList';
import { authApi, getErrorMessage, saveJwt } from '../../services/api';

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
      Alert.alert('Select gender', 'Please choose an option to continue.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await authApi.completeMobileSignup({ phone, gender: selected });
      if (!data?.token) {
        Alert.alert('Error', 'No token returned from server');
        return;
      }
      await saveJwt(data.token);
      signIn(data.token, data.user);
    } catch (e) {
      Alert.alert('Signup failed', getErrorMessage(e));
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
