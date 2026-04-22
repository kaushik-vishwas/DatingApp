import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../context/AuthContext';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import { receiverCardMetrics } from '../../utils/discoverDisplay';

const PURPLE = '#7b2cff';
const PINK = '#ff72d2';
const GREEN = '#22c55e';

type Props = NativeStackScreenProps<CallerStackParamList, 'ReceiverProfile'>;

function formatLastSeen(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

export default function ReceiverProfileScreen({ navigation, route }: Props): React.JSX.Element {
  const { receiver } = route.params;
  const { user } = useAuth();
  const [rechargeModal, setRechargeModal] = useState<'none' | 'low' | 'empty'>('none');

  const wallet = typeof user?.walletBalance === 'number' && Number.isFinite(user.walletBalance) ? user.walletBalance : 0;
  const m = receiverCardMetrics(receiver._id);
  const rate = receiver.audioCallRate;

  const openWallet = () => {
    setRechargeModal('none');
    navigation.navigate('Wallet');
  };

  const onVoiceCall = () => {
    if (rate == null || !Number.isFinite(rate)) {
      Alert.alert('Unavailable', 'This receiver has not set a call rate yet.');
      return;
    }
    if (wallet <= 0) {
      setRechargeModal('empty');
      return;
    }
    if (wallet < rate) {
      setRechargeModal('low');
      return;
    }
    Alert.alert('Voice call', 'Calling will be available in a future update.');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={styles.brand}>Nesthama</Text>
        <TouchableOpacity style={styles.topRight} onPress={() => navigation.navigate('Wallet')}>
          <Text style={styles.walletIco}>👛</Text>
          <Text style={styles.walletAmt}>₹{wallet.toLocaleString('en-IN')}</Text>
          {user?.profileImage ? (
            <Image source={{ uri: user.profileImage }} style={styles.meAv} />
          ) : (
            <View style={[styles.meAv, styles.meAvPh]}>
              <Text style={styles.meAvTxt}>{user?.name?.charAt(0) ?? '?'}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.pageTitle}>Profile</Text>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {receiver.profileImage ? (
            <Image source={{ uri: receiver.profileImage }} style={styles.heroImg} />
          ) : (
            <View style={[styles.heroImg, styles.heroPh]}>
              <Text style={styles.heroGlyph}>👤</Text>
            </View>
          )}
          <Text style={styles.name}>
            {receiver.name}
            {receiver.age != null ? `, ${receiver.age} Y` : ''}
          </Text>
          <View style={styles.tagRow}>
            {receiver.interests.slice(0, 4).map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagTxt}>{t}</Text>
              </View>
            ))}
          </View>
          <View style={styles.ratingRow}>
            <Text style={styles.star}>★</Text>
            <Text style={styles.ratingTxt}>
              {m.rating} ({m.reviews})
            </Text>
          </View>
          <Text style={styles.lastSeen}>Last seen — {formatLastSeen(receiver.updatedAt)}</Text>
        </View>

        <Text style={styles.secTitle}>Languages spoken</Text>
        <View style={styles.chipRow}>
          {receiver.languages.map((l) => (
            <View key={l} style={styles.chip}>
              <Text style={styles.chipTxt}>{l}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.secTitle}>Interests</Text>
        <View style={styles.chipRow}>
          {receiver.interests.map((t) => (
            <View key={t} style={[styles.chip, styles.chipOutline]}>
              <Text style={styles.chipTxtDark}>{t}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.outlineBtn} onPress={onVoiceCall} activeOpacity={0.9}>
          <Text style={styles.outlineIcon}>📞</Text>
          <Text style={styles.outlineLbl}>Voice Call</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.outlineBtn, styles.outlineBtnLast]}
          onPress={() =>
            navigation.navigate('CallerChat', {
              receiverId: receiver._id,
              receiverName: receiver.name,
              receiverImage: receiver.profileImage,
            })
          }
          activeOpacity={0.9}
        >
          <Text style={styles.outlineIcon}>💬</Text>
          <Text style={styles.outlineLbl}>Message</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={rechargeModal !== 'none'} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setRechargeModal('none')}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            {rechargeModal === 'empty' ? (
              <Text style={styles.modalTitleEmpty}>Empty Wallet</Text>
            ) : (
              <Text style={styles.modalTitle}>Recharge Wallet</Text>
            )}
            <Text style={styles.modalEmoji}>{rechargeModal === 'empty' ? '👛' : '👛💳'}</Text>
            <Text style={styles.modalMsg}>Your balance is low. Recharge to Get Started</Text>
            <TouchableOpacity
              style={[
                styles.modalCta,
                rechargeModal === 'empty' ? styles.modalCtaRed : styles.modalCtaPurple,
              ]}
              onPress={openWallet}
            >
              <Text style={styles.modalCtaTxt}>Recharge Now</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRechargeModal('none')}>
              <Text style={styles.modalDismiss}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: { padding: 8 },
  backTxt: { fontSize: 22, color: '#111' },
  brand: { fontSize: 18, fontWeight: '900', color: '#1b4d3e' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  walletIco: { fontSize: 16 },
  walletAmt: { fontSize: 14, fontWeight: '800', color: '#111' },
  meAv: { width: 32, height: 32, borderRadius: 16 },
  meAvPh: { backgroundColor: '#e5e5e5', alignItems: 'center', justifyContent: 'center' },
  meAvTxt: { fontWeight: '900', color: PURPLE, fontSize: 12 },
  pageTitle: { fontSize: 20, fontWeight: '900', color: '#111', paddingHorizontal: 16, marginBottom: 8 },
  scroll: { paddingHorizontal: 16, paddingBottom: 32 },
  hero: {
    backgroundColor: PINK,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  heroImg: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#fff' },
  heroPh: { backgroundColor: '#fff6', alignItems: 'center', justifyContent: 'center' },
  heroGlyph: { fontSize: 44 },
  name: { marginTop: 12, fontSize: 20, fontWeight: '900', color: '#111' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 10 },
  tag: { backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tagTxt: { fontSize: 11, fontWeight: '800', color: '#333' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  star: { color: '#fbbf24', fontSize: 16 },
  ratingTxt: { fontSize: 14, fontWeight: '800', color: '#111' },
  lastSeen: { marginTop: 8, fontSize: 12, color: '#444', fontWeight: '600' },
  secTitle: { fontSize: 14, fontWeight: '900', color: '#111', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip: { backgroundColor: 'rgba(123,44,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  chipOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5e5' },
  chipTxt: { fontSize: 12, fontWeight: '800', color: PURPLE },
  chipTxtDark: { fontSize: 12, fontWeight: '800', color: '#333' },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: PURPLE,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  outlineBtnLast: { marginBottom: 0 },
  outlineIcon: { fontSize: 18 },
  outlineLbl: { fontSize: 16, fontWeight: '900', color: PURPLE },
  modalOverlay: {
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
  modalTitleEmpty: { fontSize: 18, fontWeight: '900', color: '#dc2626', marginBottom: 8 },
  modalEmoji: { fontSize: 48, marginVertical: 8 },
  modalMsg: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  modalCta: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  modalCtaPurple: { backgroundColor: PURPLE },
  modalCtaRed: { backgroundColor: '#dc2626' },
  modalCtaTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
  modalDismiss: { color: '#666', fontSize: 14, fontWeight: '600', padding: 8 },
});
