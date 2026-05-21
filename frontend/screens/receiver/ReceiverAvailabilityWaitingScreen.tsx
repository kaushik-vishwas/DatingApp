import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../context/AuthContext';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';
import { resolveProfileImageSource } from '../../utils/avatarSource';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverAvailabilityWaiting'>;

const PURPLE = '#7b2cff';
const RING_EXPAND_MS = 2400;

export default function ReceiverAvailabilityWaitingScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const { user, refreshUser } = useAuth();
  const [goingOffline, setGoingOffline] = useState(false);

  const ring0 = useRef(new Animated.Value(0)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  const avatarSource = resolveProfileImageSource(user?.profileImage);
  const displayName = user?.name?.trim() || 'You';

  useEffect(() => {
    const rings = [ring0, ring1, ring2];
    const stagger = RING_EXPAND_MS / 3;
    const loops = rings.map((v, i) => {
      const lead = i * stagger;
      const tail = RING_EXPAND_MS + stagger - lead - RING_EXPAND_MS;
      return Animated.loop(
        Animated.sequence([
          Animated.delay(lead),
          Animated.timing(v, { toValue: 1, duration: RING_EXPAND_MS, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.delay(Math.max(0, tail)),
        ])
      );
    });
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [ring0, ring1, ring2]);

  const onGoOffline = () => {
    if (goingOffline) return;
    setGoingOffline(true);
    void (async () => {
      try {
        await profileApi.updateReceiverProfile({ isAvailable: false });
        await refreshUser();
        navigation.navigate('ReceiverMainTabs', { screen: 'ReceiverHome' });
      } catch (e) {
        Alert.alert('Could not go offline', getErrorMessage(e));
      } finally {
        setGoingOffline(false);
      }
    })();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <LinearGradient
        colors={['#0a0014', '#1e0b3d', '#4c1d95', '#6d28d9']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.body}>
        <View style={styles.avatarBlock}>
          <View style={styles.ringHub}>
            {[ring0, ring1, ring2].map((ring, idx) => (
              <Animated.View
                key={idx}
                style={[
                  styles.ring,
                  {
                    opacity: ring.interpolate({
                      inputRange: [0, 0.12, 0.5, 1],
                      outputRange: [0, 0.5, 0.18, 0],
                    }),
                    transform: [
                      {
                        scale: ring.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.55, 2.8],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ))}
            <View style={styles.avatarWrap}>
              {avatarSource ? (
                <Image source={avatarSource} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPh]}>
                  <Text style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>
          </View>

          <Text style={styles.title}>You are online</Text>
          <Text style={styles.subtitle}>Waiting for dcallers…</Text>
          <Text style={styles.hint}>Someone may join soon. Stay on this screen while you are free to talk.</Text>
        </View>

        <TouchableOpacity
          style={styles.offlineBtn}
          onPress={onGoOffline}
          disabled={goingOffline}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={['#9d174d', '#be185d', '#db2777']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.offlineBtnGrad}
          >
            {goingOffline ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.offlineBtnText}>Go offline</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0014' },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 16,
    justifyContent: 'space-between',
  },
  avatarBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 24,
  },
  ringHub: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  ring: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: 'rgba(196, 181, 253, 0.75)',
  },
  avatarWrap: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 3,
    borderColor: '#fff',
    overflow: 'hidden',
    zIndex: 2,
  },
  avatar: { width: '100%', height: '100%' },
  avatarPh: {
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 40, fontWeight: '900' },
  title: {
    color: '#f5f3ff',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: '#c4b5fd',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  hint: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 12,
    maxWidth: 320,
  },
  offlineBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 16,
  },
  offlineBtnGrad: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  offlineBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
