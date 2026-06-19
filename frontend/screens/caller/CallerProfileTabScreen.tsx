import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';

import { useAuth } from '../../context/AuthContext';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import { profileApi } from '../../services/api';
import { resolveProfileImageSource } from '../../utils/avatarSource';

const PURPLE = '#7b2cff';
const SUPPORT_EMAIL = 'support@selecto.com';

type Props = NativeStackScreenProps<CallerStackParamList, 'CallerProfile'>;

function formatWalletShort(inr: number): string {
  if (!Number.isFinite(inr) || inr < 0) return '₹0';
  if (inr >= 100000) return `₹${(inr / 100000).toFixed(inr % 100000 === 0 ? 0 : 1)}L`;
  if (inr >= 1000) return `₹${(inr / 1000).toFixed(inr % 1000 === 0 ? 0 : 1)}k`;
  return `₹${Math.round(inr)}`;
}

export default function CallerProfileTabScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const contentBottomPadding = Math.max(insets.bottom, 16) + 16;
  const { user, signOut } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [calls, setCalls] = useState(0);
  const [mins, setMins] = useState(0);

  const appVersion =
    (typeof Constants.expoConfig?.version === 'string' && Constants.expoConfig.version) || '1.0.0';

  const wallet = typeof user?.walletBalance === 'number' && Number.isFinite(user.walletBalance) ? user.walletBalance : 0;
  const profileImageSource = resolveProfileImageSource(user?.profileImage);

  const loadCallStats = useCallback(async (): Promise<void> => {
    try {
      const { data } = await profileApi.callerCallHistory('all');
      const completed = data.calls.filter((row) => row.status === 'completed');
      const totalDurationSec = completed.reduce((sum, row) => sum + Math.max(0, row.durationSec || 0), 0);
      setCalls(completed.length);
      setMins(Math.floor(totalDurationSec / 60));
    } catch {
      setCalls(0);
      setMins(0);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadCallStats();
    }, [loadCallStats])
  );

  const menuRow = (
    icon: React.ReactNode,
    label: string,
    onPress: () => void,
    opts?: { danger?: boolean }
  ) => (
    <TouchableOpacity
      style={styles.menuRow}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.menuIcon}>{icon}</View>
      <Text style={[styles.menuLbl, opts?.danger && styles.menuLblDanger]}>{label}</Text>
      <Text style={styles.menuChev}>›</Text>
    </TouchableOpacity>
  );

  const onDelete = () => {
    Alert.alert(
      'Delete account',
      'Account deletion must be completed with support so we can verify your identity and settle your wallet. Email us and we will guide you through the next steps.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Email support',
          onPress: () => void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Delete%20my%20account`),
        },
      ]
    );
  };

  const confirmLogout = () => {
    setLogoutOpen(false);
    void signOut();
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <Text style={styles.title}>Profile</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: contentBottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarRing}>
          {profileImageSource ? (
            <Image source={profileImageSource} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPh]}>
              <Text style={styles.avatarGlyph}>{user.name.charAt(0)}</Text>
            </View>
          )}
        </View>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.phone}>{user.phone ? `+91 ${user.phone}` : ''}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Feather name="phone-call" size={18} color="#666" style={styles.statIco} />
            <Text style={styles.statVal}>{calls}</Text>
            <Text style={styles.statLbl}>Calls</Text>
          </View>
          <View style={styles.statCard}>
            <Feather name="clock" size={18} color="#666" style={styles.statIco} />
            <Text style={styles.statVal}>{mins}</Text>
            <Text style={styles.statLbl}>Mins</Text>
          </View>
          <View style={styles.statCard}>
            <FontAwesome5 name="wallet" size={18} color="#666" style={styles.statIco} />
            <Text style={styles.statVal}>{formatWalletShort(wallet)}</Text>
            <Text style={styles.statLbl}>Wallet</Text>
          </View>
        </View>

        <View style={styles.actionCardsRow}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('CallerShareApp')}
            activeOpacity={0.88}
          >
            <Feather name="share-2" size={26} color="#666" style={styles.actionCardIco} />
            <Text style={styles.actionCardTitle}>Refer & Earn</Text>
            <Text style={styles.actionCardSub}>Invite friends</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('CallerFaq')}
            activeOpacity={0.88}
          >
            <MaterialIcons name="help-outline" size={26} color="#666" style={styles.actionCardIco} />
            <Text style={styles.actionCardTitle}>FAQ</Text>
            <Text style={styles.actionCardSub}>Common questions</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.menuBlock}>
          {menuRow(<Feather name="user" size={18} color="#222" />, 'Edit Profile', () => navigation.navigate('CallerEditProfile'))}
          {menuRow(<MaterialIcons name="star-outline" size={18} color="#222" />, 'Rate Us', () => navigation.navigate('CallerRateUs'))}
          {menuRow(<Feather name="message-circle" size={18} color="#222" />, 'Chats', () =>
            navigation.navigate('CallerMainTabs', { screen: 'CallerChatsTab' })
          )}
          {menuRow(<Feather name="help-circle" size={18} color="#222" />, 'Help & Support', () => navigation.navigate('CallerHelp'))}
          {menuRow(<Feather name="file-text" size={18} color="#222" />, 'Terms & Privacy', () => navigation.navigate('CallerTerms'))}
          {menuRow(<Feather name="lock" size={18} color="#222" />, 'Privacy Policy', () => navigation.navigate('CallerPrivacyPolicy'))}
          {menuRow(<MaterialIcons name="delete-outline" size={18} color="#dc2626" />, 'Delete Account', onDelete, { danger: true })}
          {menuRow(<MaterialIcons name="logout" size={18} color="#dc2626" />, 'Logout', () => setLogoutOpen(true), { danger: true })}
        </View>

        <Text style={styles.version}>Version {appVersion}</Text>
      </ScrollView>

      <Modal visible={logoutOpen} transparent animationType="fade">
        <Pressable style={styles.modalBg} onPress={() => setLogoutOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Log out !</Text>
            <MaterialIcons name="logout" size={52} color="#dc2626" style={styles.modalIcon} />
            <Text style={styles.modalMsg}>Are You sure you want to logout !</Text>
            <TouchableOpacity style={styles.modalCta} onPress={confirmLogout} activeOpacity={0.9}>
              <Text style={styles.modalCtaTxt}>Log out</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setLogoutOpen(false)} style={styles.modalCancel}>
              <Text style={styles.modalCancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
    color: '#111',
    textAlign: 'center',
  },
  scroll: { paddingHorizontal: 20 },
  avatarRing: {
    alignSelf: 'center',
    padding: 4,
    borderRadius: 80,
    borderWidth: 3,
    borderColor: PURPLE,
    marginBottom: 12,
  },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarPh: { backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' },
  avatarGlyph: { fontSize: 40, fontWeight: '900', color: PURPLE },
  name: { fontSize: 20, fontWeight: '900', color: '#111', textAlign: 'center' },
  phone: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 4, marginBottom: 22 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1,
    backgroundColor: '#fafafa',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
  },
  statIco: { marginBottom: 6 },
  statVal: { fontSize: 16, fontWeight: '900', color: '#111' },
  statLbl: { fontSize: 11, color: '#666', marginTop: 4, fontWeight: '700' },
  actionCardsRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  actionCard: {
    flex: 1,
    backgroundColor: '#fafafa',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ececec',
  },
  actionCardIco: { marginBottom: 8 },
  actionCardTitle: { fontSize: 15, fontWeight: '900', color: '#111' },
  actionCardSub: { fontSize: 11, color: '#888', marginTop: 4, fontWeight: '600', textAlign: 'center' },
  menuBlock: { gap: 10 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ececec',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  menuIcon: { width: 30, marginRight: 12 },
  menuLbl: { flex: 1, fontSize: 15, fontWeight: '700', color: '#222' },
  menuLblDanger: { color: '#dc2626' },
  menuChev: { fontSize: 22, color: '#ccc', fontWeight: '300' },
  version: { textAlign: 'center', color: '#bbb', fontSize: 12, marginTop: 28, marginBottom: 8 },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#111', marginBottom: 8 },
  modalIcon: { marginVertical: 8 },
  modalMsg: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 22, lineHeight: 20 },
  modalCta: {
    width: '100%',
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  modalCtaTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
  modalCancel: { padding: 10 },
  modalCancelTxt: { color: '#666', fontWeight: '600', fontSize: 15 },
});