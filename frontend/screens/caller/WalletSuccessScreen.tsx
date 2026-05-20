import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { CommonActions } from '@react-navigation/native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '../../context/AuthContext';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<CallerStackParamList, 'WalletSuccess'>;

export default function WalletSuccessScreen({ navigation, route }: Props): React.JSX.Element {
  const { creditAdded, newBalance } = route.params;
  const { refreshUser } = useAuth();

  const goBack = () => {
    void refreshUser();
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'CallerMainTabs', params: { screen: 'CallerHome' } }],
      })
    );
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>Recharge Successful</Text>
        <Text style={styles.emoji}>💰</Text>
        <Text style={styles.congrats}>Congratulations!</Text>
        <Text style={styles.detail}>
          +₹{creditAdded.toLocaleString('en-IN')} added · Balance ₹{newBalance.toLocaleString('en-IN')}
        </Text>
        <TouchableOpacity style={styles.cta} onPress={goBack} activeOpacity={0.9}>
          <Text style={styles.ctaTxt}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  title: { fontSize: 20, fontWeight: '900', color: '#111', marginBottom: 8 },
  emoji: { fontSize: 56, marginVertical: 8 },
  congrats: { fontSize: 16, fontWeight: '800', color: PURPLE, marginBottom: 8 },
  detail: { fontSize: 13, color: '#555', textAlign: 'center', marginBottom: 22, lineHeight: 20 },
  cta: {
    backgroundColor: PURPLE,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  ctaTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
