import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
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
import { Feather, MaterialIcons, Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../context/AuthContext';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import { profileApi } from '../../services/api';
import { resolveProfileImageSource } from '../../utils/avatarSource';

const PURPLE = '#7b2cff';
const SUPPORT_EMAIL = 'support@selecto.com';

type Props = NativeStackScreenProps<CallerStackParamList, 'CallerProfile'>;

type IconTone = {
  bg: string;
  fg: string;
  border: string;
};

const TONES = {
  purple: { bg: '#F3EBFF', fg: '#7b2cff', border: '#E4D4FF' },
  blue: { bg: '#EEF4FF', fg: '#2563EB', border: '#D6E4FF' },
  teal: { bg: '#ECFDF8', fg: '#0D9488', border: '#CFFAEC' },
  amber: { bg: '#FFF7ED', fg: '#C2410C', border: '#FFEDD5' },
  rose: { bg: '#FFF1F5', fg: '#BE185D', border: '#FECDD3' },
  slate: { bg: '#F4F6F8', fg: '#475569', border: '#E2E8F0' },
  danger: { bg: '#FEF2F2', fg: '#DC2626', border: '#FECACA' },
} as const satisfies Record<string, IconTone>;

function formatWalletShort(inr: number): string {
  if (!Number.isFinite(inr) || inr < 0) return '₹0';
  if (inr >= 100000) return `₹${(inr / 100000).toFixed(inr % 100000 === 0 ? 0 : 1)}L`;
  if (inr >= 1000) return `₹${(inr / 1000).toFixed(inr % 1000 === 0 ? 0 : 1)}k`;
  return `₹${Math.round(inr)}`;
}

function IconBubble({
  tone,
  children,
  size = 40,
}: {
  tone: IconTone;
  children: React.ReactNode;
  size?: number;
}): React.JSX.Element {
  return (
    <View
      style={[
        styles.iconBubble,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tone.bg,
          borderColor: tone.border,
        },
      ]}
    >
      {children}
    </View>
  );
}

export default function CallerProfileTabScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const contentBottomPadding = Math.max(insets.bottom, 16) + 20;
  const { user, signOut } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [calls, setCalls] = useState(0);
  const [mins, setMins] = useState(0);

  const appVersion =
    (typeof Constants.expoConfig?.version === 'string' && Constants.expoConfig.version) || '1.0.0';

  const wallet =
    typeof user?.walletBalance === 'number' && Number.isFinite(user.walletBalance) ? user.walletBalance : 0;
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
    tone: IconTone,
    label: string,
    onPress: () => void,
    opts?: { danger?: boolean; last?: boolean }
  ) => (
    <TouchableOpacity
      style={[styles.menuRow, opts?.last && styles.menuRowLast]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <IconBubble tone={tone} size={38}>
        {icon}
      </IconBubble>
      <Text style={[styles.menuLbl, opts?.danger && styles.menuLblDanger]}>{label}</Text>
      <View style={[styles.chevWrap, opts?.danger && styles.chevWrapDanger]}>
        <Ionicons name="chevron-forward" size={16} color={opts?.danger ? '#F87171' : '#A78BFA'} />
      </View>
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
          <Ionicons name="chevron-back" size={26} color="#1F1635" />
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: contentBottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#F3EBFF', '#FFFFFF', '#FFF7FB']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.avatarRing}>
            {profileImageSource ? (
              <Image source={profileImageSource} style={styles.avatar} />
            ) : (
              <LinearGradient colors={['#9B5CFF', '#7b2cff']} style={[styles.avatar, styles.avatarPh]}>
                <Text style={styles.avatarGlyph}>{user.name.charAt(0).toUpperCase()}</Text>
              </LinearGradient>
            )}
          </View>
          <Text style={styles.name}>{user.name}</Text>
          {user.phone ? (
            <View style={styles.phonePill}>
              <Feather name="phone" size={12} color={PURPLE} />
              <Text style={styles.phone}>+91 {user.phone}</Text>
            </View>
          ) : null}
        </LinearGradient>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderColor: TONES.blue.border, backgroundColor: '#FBFCFF' }]}>
            <IconBubble tone={TONES.blue} size={36}>
              <Feather name="phone-call" size={16} color={TONES.blue.fg} />
            </IconBubble>
            <Text style={styles.statVal}>{calls}</Text>
            <Text style={styles.statLbl}>Calls</Text>
          </View>
          <View style={[styles.statCard, { borderColor: TONES.amber.border, backgroundColor: '#FFFCFA' }]}>
            <IconBubble tone={TONES.amber} size={36}>
              <Feather name="clock" size={16} color={TONES.amber.fg} />
            </IconBubble>
            <Text style={styles.statVal}>{mins}</Text>
            <Text style={styles.statLbl}>Mins</Text>
          </View>
          <View style={[styles.statCard, { borderColor: TONES.teal.border, backgroundColor: '#FAFFFD' }]}>
            <IconBubble tone={TONES.teal} size={36}>
              <Ionicons name="wallet-outline" size={17} color={TONES.teal.fg} />
            </IconBubble>
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
            <LinearGradient
              colors={['#F3EBFF', '#FBF7FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.actionCardInner}
            >
              <IconBubble tone={TONES.purple} size={44}>
                <Feather name="gift" size={20} color={TONES.purple.fg} />
              </IconBubble>
              <Text style={styles.actionCardTitle}>Refer & Earn</Text>
              <Text style={styles.actionCardSub}>Invite friends & get free talk</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('CallerFaq')}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={['#EEF4FF', '#F8FBFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.actionCardInner}
            >
              <IconBubble tone={TONES.blue} size={44}>
                <MaterialIcons name="help-outline" size={22} color={TONES.blue.fg} />
              </IconBubble>
              <Text style={styles.actionCardTitle}>FAQ</Text>
              <Text style={styles.actionCardSub}>Answers to common questions</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.menuBlock}>
          {menuRow(
            <Feather name="user" size={17} color={TONES.purple.fg} />,
            TONES.purple,
            'Edit Profile',
            () => navigation.navigate('CallerEditProfile')
          )}
          {menuRow(
            <Feather name="message-circle" size={17} color={TONES.teal.fg} />,
            TONES.teal,
            'Chats',
            () => navigation.navigate('CallerMainTabs', { screen: 'CallerChatsTab' }),
            { last: true }
          )}
        </View>

        <Text style={styles.sectionLabel}>Support</Text>
        <View style={styles.menuBlock}>
          {menuRow(
            <MaterialIcons name="star-outline" size={18} color={TONES.amber.fg} />,
            TONES.amber,
            'Rate Us',
            () => navigation.navigate('CallerRateUs')
          )}
          {menuRow(
            <Feather name="help-circle" size={17} color={TONES.blue.fg} />,
            TONES.blue,
            'Help & Support',
            () => navigation.navigate('CallerHelp')
          )}
          {menuRow(
            <Feather name="file-text" size={17} color={TONES.slate.fg} />,
            TONES.slate,
            'Terms & Privacy',
            () => navigation.navigate('CallerTerms')
          )}
          {menuRow(
            <Feather name="shield" size={17} color={TONES.purple.fg} />,
            TONES.purple,
            'Privacy Policy',
            () => navigation.navigate('CallerPrivacyPolicy'),
            { last: true }
          )}
        </View>

        <Text style={styles.sectionLabel}>Danger zone</Text>
        <View style={styles.menuBlock}>
          {menuRow(
            <MaterialIcons name="delete-outline" size={18} color={TONES.danger.fg} />,
            TONES.danger,
            'Delete Account',
            onDelete,
            { danger: true }
          )}
          {menuRow(
            <MaterialIcons name="logout" size={18} color={TONES.danger.fg} />,
            TONES.danger,
            'Logout',
            () => setLogoutOpen(true),
            { danger: true, last: true }
          )}
        </View>

        <Text style={styles.version}>Version {appVersion}</Text>
      </ScrollView>

      <Modal visible={logoutOpen} transparent animationType="fade">
        <Pressable style={styles.modalBg} onPress={() => setLogoutOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalIconWrap, { backgroundColor: TONES.danger.bg }]}>
              <MaterialIcons name="logout" size={34} color={TONES.danger.fg} />
            </View>
            <Text style={styles.modalTitle}>Log out?</Text>
            <Text style={styles.modalMsg}>You can sign back in anytime with your phone number.</Text>
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
  safe: { flex: 1, backgroundColor: '#F7F5FB' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    color: '#1F1635',
    textAlign: 'center',
  },
  scroll: { paddingHorizontal: 18 },
  heroCard: {
    borderRadius: 24,
    paddingTop: 22,
    paddingBottom: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EBDFFF',
    marginBottom: 16,
    overflow: 'hidden',
  },
  avatarRing: {
    padding: 4,
    borderRadius: 64,
    borderWidth: 3,
    borderColor: '#C4A1FF',
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  avatar: { width: 92, height: 92, borderRadius: 46 },
  avatarPh: { alignItems: 'center', justifyContent: 'center' },
  avatarGlyph: { fontSize: 38, fontWeight: '900', color: '#fff' },
  name: { fontSize: 22, fontWeight: '900', color: '#1F1635', textAlign: 'center' },
  phonePill: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(123,44,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  phone: { fontSize: 13, color: '#5B4B8A', fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    gap: 6,
  },
  iconBubble: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statVal: { fontSize: 16, fontWeight: '900', color: '#1F1635' },
  statLbl: { fontSize: 11, color: '#6B7280', fontWeight: '700' },
  actionCardsRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  actionCard: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E8E0F5',
  },
  actionCardInner: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    minHeight: 132,
  },
  actionCardTitle: { marginTop: 10, fontSize: 15, fontWeight: '900', color: '#1F1635', textAlign: 'center' },
  actionCardSub: {
    marginTop: 4,
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 15,
  },
  sectionLabel: {
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '800',
    color: '#8B7AA8',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  menuBlock: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EDE7F6',
    overflow: 'hidden',
    shadowColor: '#7b2cff',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0EBF8',
    gap: 12,
  },
  menuRowLast: { borderBottomWidth: 0 },
  menuLbl: { flex: 1, fontSize: 15, fontWeight: '700', color: '#2A2140' },
  menuLblDanger: { color: '#DC2626' },
  chevWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F5F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevWrapDanger: { backgroundColor: '#FEF2F2' },
  version: { textAlign: 'center', color: '#B0A8C2', fontSize: 12, marginTop: 24, fontWeight: '600' },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(20,12,40,0.48)',
    justifyContent: 'center',
    padding: 28,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
  },
  modalIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 19, fontWeight: '900', color: '#1F1635', marginBottom: 8 },
  modalMsg: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 22, lineHeight: 20 },
  modalCta: {
    width: '100%',
    backgroundColor: '#DC2626',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 6,
  },
  modalCtaTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
  modalCancel: { padding: 10 },
  modalCancelTxt: { color: '#6B7280', fontWeight: '700', fontSize: 15 },
});
