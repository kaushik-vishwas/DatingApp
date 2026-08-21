import React, { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WalletHomeOfferPopup } from '../../types/api';
import { walletCreditForRecharge } from '../../utils/walletRechargeFees';
import { msUntilLocalMidnight } from '../../utils/callerHomeOfferPopupStorage';

type Props = {
  visible: boolean;
  popup: WalletHomeOfferPopup;
  onDismiss: () => void;
  onRecharge: () => void;
};

type PopupStep = 'social' | 'spotlight';

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function CallerHomeOfferPopup({
  visible,
  popup,
  onDismiss,
  onRecharge,
}: Props): React.JSX.Element {
  const [remainMs, setRemainMs] = useState(msUntilLocalMidnight);
  const [step, setStep] = useState<PopupStep>('social');
  const credit = useMemo(
    () => Math.round(walletCreditForRecharge(popup.amount, popup.bonusPercent)),
    [popup.amount, popup.bonusPercent]
  );

  useEffect(() => {
    if (!visible) return;
    setStep('social');
    setRemainMs(msUntilLocalMidnight());
    const t = setInterval(() => setRemainMs(msUntilLocalMidnight()), 1000);
    return () => clearInterval(t);
  }, [visible, popup.offerId]);

  const goNextOrClose = (): void => {
    if (step === 'social') {
      setStep('spotlight');
      return;
    }
    onDismiss();
  };

  const timer = formatCountdown(remainMs);
  const isSocial = step === 'social';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={goNextOrClose}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          {isSocial ? (
            <View style={styles.timerBar}>
              <Ionicons name="time-outline" size={16} color="#ef4444" />
              <Text style={styles.timerBarText}>Offer ends in {timer}</Text>
            </View>
          ) : (
            <View style={styles.spotlightTop}>
              <View style={styles.timerPill}>
                <Ionicons name="time-outline" size={14} color="#fff" />
                <Text style={styles.timerPillText}>Offer ends in {timer}</Text>
              </View>
              <TouchableOpacity onPress={goNextOrClose} hitSlop={12} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {isSocial ? (
            <>
              <Text style={styles.headline}>Don't miss out on the Best Offers!</Text>
              <View style={styles.highlightBox}>
                <View style={styles.bellWrap}>
                  <Ionicons name="notifications" size={28} color="#f472b6" />
                  <Text style={styles.percentBadge}>%</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.limited}>Limited Time Offer</Text>
                  <Text style={styles.flatOff}>Flat {popup.bonusPercent}% Extra!</Text>
                </View>
              </View>
              <View style={styles.avatars}>
                {['A', 'R', 'S'].map((ch, i) => (
                  <View key={ch} style={[styles.avatar, { marginLeft: i === 0 ? 0 : -10, zIndex: 3 - i }]}>
                    <Text style={styles.avatarTxt}>{ch}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.social}>750+ users availed this offer till now</Text>
            </>
          ) : (
            <>
              <Text style={styles.limitedCenter}>Limited Time Offer</Text>
              <Text style={styles.flatOffCenter}>Flat {popup.bonusPercent}% Extra!</Text>
              <Text style={styles.onRecharge}>on the recharge of ₹{popup.amount}</Text>
              <View style={styles.megaWrap}>
                <Ionicons name="megaphone" size={72} color="#a78bfa" />
                <Text style={styles.floatPct}>%</Text>
              </View>
            </>
          )}

          <TouchableOpacity style={styles.cta} onPress={onRecharge} activeOpacity={0.9}>
            <Text style={styles.ctaText}>
              Recharge for <Text style={styles.strike}>₹{credit}</Text> ₹{popup.amount}
            </Text>
          </TouchableOpacity>

          {isSocial ? (
            <TouchableOpacity onPress={goNextOrClose} style={styles.dismissWrap}>
              <Text style={styles.dismiss}>I don't want this Offer</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: {
    backgroundColor: '#0b1220',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
  },
  timerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#3f1d1d',
    borderRadius: 10,
    paddingVertical: 8,
    marginBottom: 14,
  },
  timerBarText: { color: '#f87171', fontWeight: '800', fontSize: 13 },
  spotlightTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ef4444',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  timerPillText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  headline: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 14,
  },
  highlightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#38bdf8',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  bellWrap: { width: 44, alignItems: 'center' },
  percentBadge: { color: '#fbbf24', fontWeight: '900', marginTop: -6 },
  limited: { color: '#e5e7eb', fontWeight: '700', fontSize: 13 },
  limitedCenter: { color: '#e5e7eb', fontWeight: '700', fontSize: 14, textAlign: 'center' },
  flatOff: { color: '#4ade80', fontWeight: '900', fontSize: 22, marginTop: 2 },
  flatOffCenter: { color: '#4ade80', fontWeight: '900', fontSize: 28, textAlign: 'center', marginTop: 4 },
  onRecharge: { color: '#fff', textAlign: 'center', marginTop: 4, fontWeight: '600' },
  megaWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 18 },
  floatPct: { position: 'absolute', right: 78, top: 18, color: '#c4b5fd', fontSize: 28, fontWeight: '900' },
  avatars: { flexDirection: 'row', justifyContent: 'center', marginBottom: 8 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0b1220',
  },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
  social: { color: '#fff', textAlign: 'center', fontSize: 13, marginBottom: 16 },
  cta: {
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  strike: { textDecorationLine: 'line-through', color: '#bfdbfe', fontWeight: '700' },
  dismissWrap: { alignItems: 'center', marginTop: 12 },
  dismiss: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
