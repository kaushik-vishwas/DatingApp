import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';

type Props = NativeStackScreenProps<ReceiverStackParamList, 'ReceiverCreateProfile'>;

/** Legacy route — forwards to step-by-step receiver onboarding. */
export default function ReceiverCreateProfileScreen({ navigation, route }: Props): React.JSX.Element {
  useEffect(() => {
    navigation.replace('ReceiverOnboarding', { gender: route.params?.gender });
  }, [navigation, route.params?.gender]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#7b2cff" />
    </View>
  );
}
