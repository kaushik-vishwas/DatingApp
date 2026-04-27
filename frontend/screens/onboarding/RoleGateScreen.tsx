import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { RootStackParamList } from '../../navigation/RootStackParamList';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<RootStackParamList, 'RoleGate'>;

export default function RoleGateScreen({ navigation }: Props): React.JSX.Element {
  const goUser = () => {
    navigation.navigate('UserLogin', undefined);
  };

  const goReceiver = () => {
    navigation.navigate('ReceiverEducation', undefined);
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Welcome</Text>
      <Text style={styles.subtitle}>How would you like to use Selecto?</Text>

      <TouchableOpacity style={styles.cardPrimary} onPress={goUser} activeOpacity={0.9}>
        <Text style={styles.cardTitle}>Join as an app user</Text>
        <Text style={styles.cardBody}>Meet people, chat, and use the app as a member.</Text>
        <Text style={styles.cardCta}>User sign in →</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cardSecondary} onPress={goReceiver} activeOpacity={0.9}>
        <Text style={styles.cardTitleDark}>Receive calls & earn</Text>
        <Text style={styles.cardBodyDark}>Become a call receiver. You will see a short guide first.</Text>
        <Text style={styles.cardCtaDark}>Receiver path →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f6f6f7',
    paddingHorizontal: 22,
    paddingTop: 56,
    paddingBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#555',
    marginBottom: 28,
    lineHeight: 22,
  },
  cardPrimary: {
    backgroundColor: PURPLE,
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
  },
  cardSecondary: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e4e4e4',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  cardTitleDark: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
    marginBottom: 8,
  },
  cardBody: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 20,
    marginBottom: 12,
  },
  cardBodyDark: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginBottom: 12,
  },
  cardCta: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  cardCtaDark: {
    fontSize: 14,
    fontWeight: '800',
    color: PURPLE,
  },
});
