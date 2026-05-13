import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import React, { useMemo } from 'react';
import { Alert, Platform, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CallerStackParamList } from '../../navigation/CallerStackParamList';

const PURPLE = '#7b2cff';
const ANDROID_PACKAGE = 'com.kaushikvishwas.frontend';

type Props = NativeStackScreenProps<CallerStackParamList, 'CallerShareApp'>;

export default function CallerShareAppScreen({ navigation }: Props): React.JSX.Element {
  const sharePayload = useMemo(() => {
    const playUrl = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
    const name =
      (typeof Constants.expoConfig?.name === 'string' && Constants.expoConfig.name) || 'Selecto';
    const message =
      Platform.OS === 'android'
        ? `Try ${name} — voice calls and more.\n\n${playUrl}`
        : `Try ${name} — voice calls and more.\n\nGet it on the App Store or Google Play.`;
    return { title: `Share ${name}`, message };
  }, []);

  const onShare = async () => {
    try {
      await Share.share({
        title: sharePayload.title,
        message: sharePayload.message,
      });
    } catch {
      Alert.alert('Share', 'Sharing is not available on this device.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Share app</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.emoji}>📤</Text>
        <Text style={styles.head}>Invite friends</Text>
        <Text style={styles.body}>
          Share Selecto with someone who might enjoy voice calls and a friendly community. Use your
          device share sheet to send by message, email, or social apps.
        </Text>
        <TouchableOpacity style={styles.cta} onPress={() => void onShare()} activeOpacity={0.9}>
          <Text style={styles.ctaTxt}>Share</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backBtn: { padding: 10 },
  back: { fontSize: 22, color: '#111' },
  headerTitle: { fontSize: 17, fontWeight: '900', color: '#111' },
  card: {
    margin: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 22,
    borderWidth: 1,
    borderColor: '#eee',
  },
  emoji: { fontSize: 40, textAlign: 'center', marginBottom: 12 },
  head: { fontSize: 18, fontWeight: '900', color: '#111', textAlign: 'center', marginBottom: 10 },
  body: { fontSize: 14, color: '#666', lineHeight: 22, textAlign: 'center', marginBottom: 20 },
  cta: {
    backgroundColor: PURPLE,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
