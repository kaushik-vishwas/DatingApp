import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverAutoVerification'>;

export default function ReceiverAutoVerificationScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <Text style={styles.title}>Auto Verification</Text>
        <Text style={styles.sub}>
          Your profile details were submitted and auto verification is complete.
        </Text>

        <TouchableOpacity style={styles.btn} onPress={() => navigation.replace('ReceiverHome')}>
          <Text style={styles.btnText}>Next</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f8' },
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '900', color: '#111' },
  sub: { marginTop: 10, fontSize: 13, color: '#666', textAlign: 'center' },
  btn: {
    marginTop: 20,
    backgroundColor: '#7b2cff',
    borderRadius: 10,
    paddingHorizontal: 26,
    paddingVertical: 11,
  },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
