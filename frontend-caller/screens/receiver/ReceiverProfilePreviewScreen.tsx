import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';
import { resolveProfileImageSource } from '../../utils/avatarSource';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverProfilePreview'>;

export default function ReceiverProfilePreviewScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const [ratingAvg, setRatingAvg] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [totalScore, setTotalScore] = useState(() =>
    user?.role === 'receiver' && typeof user.cumulativeScore === 'number' && Number.isFinite(user.cumulativeScore)
      ? user.cumulativeScore
      : 0
  );

  useEffect(() => {
    if (
      user?.role === 'receiver' &&
      typeof user.cumulativeScore === 'number' &&
      Number.isFinite(user.cumulativeScore)
    ) {
      setTotalScore(user.cumulativeScore);
    }
  }, [user?.role, user?.cumulativeScore]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const { data } = await profileApi.receiverCallInsights('all');
        if (!mounted) return;
        setRatingAvg(data.receiverRatingAvg ?? 0);
        setRatingCount(data.receiverRatingCount ?? 0);
        setTotalScore(data.totalScore ?? 0);
      } catch (e) {
        if (!mounted) return;
        console.warn('receiver profile preview rating load failed:', getErrorMessage(e));
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const interestStr =
    user?.interests && user.interests.length > 0 ? user.interests.slice(0, 3).join(' • ') : '—';
  const rateLabel =
    typeof user?.audioCallRate === 'number' && Number.isFinite(user.audioCallRate)
      ? `₹${user.audioCallRate}/min`
      : '₹5/min';
  const displayedLanguages = (user?.languages ?? []).slice(0, 2).map((lang) => lang.substring(0, 3));
  const remainingCount = Math.max(0, (user?.languages?.length ?? 0) - 2);
  const profileImageSource = resolveProfileImageSource(user?.profileImage);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Public Profile Preview</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>Total Scores</Text>
          <Text style={styles.scoreValue}>{Math.round(totalScore).toLocaleString('en-IN')}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.leftColumn}>
              <View style={[styles.avatarWrapper, { borderColor: '#22c55e' }]}>
                {profileImageSource ? (
                  <Image source={profileImageSource} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarGlyph}>👤</Text>
                  </View>
                )}
                <View style={[styles.statusDot, { backgroundColor: '#22c55e' }]} />
              </View>
              <View style={styles.ratingBelow}>
                <Text style={styles.star}>★</Text>
                <Text style={styles.ratingText}>{ratingAvg.toFixed(1)}</Text>
                <Text style={styles.ratingCount}>({ratingCount})</Text>
              </View>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.cardName} numberOfLines={1}>
                {user?.name ?? 'Receiver'}
                {user?.age != null ? `, ${user.age}` : ''}
              </Text>
              <Text style={styles.cardInterests} numberOfLines={1}>
                {interestStr}
              </Text>
              <Text style={styles.cardLoc} numberOfLines={1}>
                {user?.state?.trim() || '—'}
              </Text>
            </View>

            <View style={styles.rightColumn}>
              <View style={styles.callBtn}>
                <Text style={styles.callBtnText}>{rateLabel}</Text>
              </View>
              <View style={styles.languagesRow}>
                {displayedLanguages.map((lang) => (
                  <View key={lang} style={styles.miniLang}>
                    <Text style={styles.miniLangText}>{lang}</Text>
                  </View>
                ))}
                {remainingCount > 0 ? <Text style={styles.moreLang}>+{remainingCount}</Text> : null}
              </View>
              <View style={[styles.statusPillRight, { backgroundColor: '#22c55e15' }]}>
                <Text style={[styles.statusTextRight, { color: '#22c55e' }]}>Online</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7' },
  screen: { flex: 1, backgroundColor: '#f6f6f7' },
  content: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 20, color: '#111', fontWeight: '700' },
  headerTitle: { fontSize: 15, color: '#111', fontWeight: '900' },
  scoreCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    padding: 14,
    marginBottom: 12,
  },
  scoreLabel: { fontSize: 12, color: '#666', fontWeight: '700' },
  scoreValue: { marginTop: 4, fontSize: 24, color: '#7b2cff', fontWeight: '900' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ececec',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  leftColumn: {
    alignItems: 'center',
    width: 60,
  },
  avatarWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlyph: {
    fontSize: 22,
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  ratingBelow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    marginTop: 6,
  },
  star: {
    color: '#fbbf24',
    fontSize: 10,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#444',
  },
  ratingCount: {
    fontSize: 9,
    color: '#888',
  },
  infoSection: {
    flex: 1,
    gap: 6,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  cardInterests: {
    fontSize: 11,
    color: '#666',
    lineHeight: 14,
  },
  cardLoc: {
    fontSize: 11,
    color: '#888',
    fontWeight: '500',
    marginTop: 2,
  },
  rightColumn: {
    alignItems: 'flex-end',
    minWidth: 70,
    gap: 8,
  },
  callBtn: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 65,
    alignItems: 'center',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  callBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 11,
  },
  languagesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 4,
  },
  miniLang: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
  miniLangText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
  },
  moreLang: {
    fontSize: 9,
    color: '#999',
    fontWeight: '500',
  },
  statusPillRight: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusTextRight: {
    fontSize: 10,
    fontWeight: '600',
  },
});
