import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SignupGenderSelection, {
  type SignupGender,
} from '../../components/auth/SignupGenderSelection';
import { useUserOnboarding } from '../../context/UserOnboardingContext';
import type { UserOnboardingStackParamList } from '../../navigation/UserOnboardingStackParamList';

type Props = NativeStackScreenProps<
  UserOnboardingStackParamList,
  'SelectGender'
>;

export default function OnboardingSelectGenderScreen({
  navigation,
}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { gender, setGender } = useUserOnboarding();
  const [selected, setSelected] = useState<SignupGender | null>(
    gender === 'male' || gender === 'female' ? gender : null,
  );

  const canContinue = useMemo(() => Boolean(selected), [selected]);

  const onContinue = () => {
    if (!selected) return;
    setGender(selected);
    navigation.navigate('ChooseAvatar');
  };

  return (
    <SignupGenderSelection
      paddingTop={Math.max(insets.top, 16) + 12}
      paddingBottom={Math.max(insets.bottom, 16) + 12}
      selected={selected}
      onSelect={setSelected}
      onBack={() => navigation.goBack()}
      onContinue={onContinue}
      continueDisabled={!canContinue}
      continueLabel="Continue"
    />
  );
}
