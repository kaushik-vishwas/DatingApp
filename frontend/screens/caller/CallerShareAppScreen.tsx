import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import { profileApi } from '../../services/api';
import { buildAppShareMessage, getAppShareConfig } from '../../utils/appShareConfig';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<CallerStackParamList, 'CallerShareApp'>;

export default function CallerShareAppScreen({ navigation }: Props): React.JSX.Element {
  const shareConfig = useMemo(() => getAppShareConfig(), []);
  const [loadingReferral, setLoadingReferral] = useState(true);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await profileApi.referralProfile();
        if (!cancelled) {
          setReferralCode(data.referralCode);
          setShareUrl(data.shareUrl);
        }
      } catch {
        if (!cancelled) {
          setReferralCode(null);
          setShareUrl(null);
        }
      } finally {
        if (!cancelled) setLoadingReferral(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sharePayload = useMemo(
    () => buildAppShareMessage({ referralCode, shareUrl }),
    [referralCode, shareUrl]
  );

  const onShare = useCallback(async () => {
    try {
      await Share.share({
        title: sharePayload.title,
        message: sharePayload.message,
      });
    } catch {
      Alert.alert('Share', 'Sharing is not available on this device.');
    }
  }, [sharePayload.message, sharePayload.title]);

  const testingHint =
    shareConfig.distribution === 'testing' && !shareConfig.androidInstallUrl
      ? ''
      : shareConfig.distribution === 'testing' && shareConfig.androidInstallUrl
        ? 'Beta testers can open the install link in your shared message.'
        : null;

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
          Share {shareConfig.displayName} with friends. They can use your invite link or code when
          signing up so you earn referral rewards.
        </Text>

        {loadingReferral ? (
          <ActivityIndicator color={PURPLE} style={{ marginBottom: 16 }} />
        ) : referralCode ? (
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>Your invite code</Text>
            <Text style={styles.codeValue}>{referralCode}</Text>
          </View>
        ) : null}

        {testingHint ? <Text style={styles.hint}>{testingHint}</Text> : null}

        <TouchableOpacity style={styles.cta} onPress={() => void onShare()} activeOpacity={0.9}>
          <Text style={styles.ctaTxt}>Share invite</Text>
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
  body: { fontSize: 14, color: '#666', lineHeight: 22, textAlign: 'center', marginBottom: 16 },
  codeBox: {
    backgroundColor: '#f3ecff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
    alignItems: 'center',
  },
  codeLabel: { fontSize: 12, fontWeight: '700', color: '#7b2cff', marginBottom: 4 },
  codeValue: { fontSize: 20, fontWeight: '900', color: '#111', letterSpacing: 2 },
  hint: {
    fontSize: 12,
    color: '#888',
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 14,
  },
  cta: {
    backgroundColor: PURPLE,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
