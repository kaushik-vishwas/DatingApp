import * as Application from 'expo-application';
import Constants from 'expo-constants';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { appApi } from '../services/api';
import type { AppUpdatePolicyResponse } from '../types/api';

const PURPLE = '#7b2cff';

function getAndroidVersionCode(): number {
  const raw = Application.nativeBuildVersion;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function shouldSkipUpdateGate(): boolean {
  if (Platform.OS !== 'android') return true;
  if (__DEV__) return true;
  if (Constants.appOwnership === 'expo') return true;
  return false;
}

function mustForceUpdate(policy: AppUpdatePolicyResponse, versionCode: number): boolean {
  if (!policy.enabled || !policy.force) return false;
  if (policy.minAndroidVersionCode <= 0) return false;
  return versionCode < policy.minAndroidVersionCode;
}

type Props = {
  children: React.ReactNode;
};

/**
 * Blocks the app on outdated Play Store builds until the user updates.
 * Policy is controlled server-side via GET /app/update-policy (env vars).
 */
export default function AppUpdateGate({ children }: Props): React.JSX.Element {
  const [checking, setChecking] = useState(!shouldSkipUpdateGate());
  const [blocked, setBlocked] = useState(false);
  const [policy, setPolicy] = useState<AppUpdatePolicyResponse | null>(null);

  const evaluate = useCallback(async () => {
    if (shouldSkipUpdateGate()) {
      setChecking(false);
      setBlocked(false);
      return;
    }

    // After the first check, keep the live tree mounted (in-call Stream must not unmount).
    try {
      const { data } = await appApi.getUpdatePolicy();
      setPolicy(data);
      const versionCode = getAndroidVersionCode();
      setBlocked(mustForceUpdate(data, versionCode));
    } catch {
      setBlocked(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void evaluate();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void evaluate();
    });
    return () => sub.remove();
  }, [evaluate]);

  const openPlayStore = () => {
    const url = policy?.playStoreUrl?.trim();
    if (!url) return;
    void Linking.openURL(url);
  };

  if (checking) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={PURPLE} />
      </View>
    );
  }

  if (blocked && policy) {
    return (
      <SafeAreaView style={styles.blocked} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.blockedInner}>
          <Text style={styles.title}>{policy.title}</Text>
          <Text style={styles.message}>{policy.message}</Text>
          <Text style={styles.hint}>You must install the latest version from the Play Store to continue.</Text>
          <TouchableOpacity style={styles.cta} onPress={openPlayStore} activeOpacity={0.9}>
            <Text style={styles.ctaTxt}>Update on Play Store</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  blocked: {
    flex: 1,
    backgroundColor: '#fff',
  },
  blockedInner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111',
    marginBottom: 14,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    color: '#444',
    textAlign: 'center',
    marginBottom: 10,
  },
  hint: {
    fontSize: 13,
    lineHeight: 20,
    color: '#888',
    textAlign: 'center',
    marginBottom: 28,
  },
  cta: {
    backgroundColor: PURPLE,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
