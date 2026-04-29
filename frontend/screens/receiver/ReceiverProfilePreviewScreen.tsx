import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverProfilePreview'>;

export default function ReceiverProfilePreviewScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const [ratingAvg, setRatingAvg] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const { data } = await profileApi.receiverCallInsights('all');
        if (!mounted) return;
        setRatingAvg(data.receiverRatingAvg ?? 0);
        setRatingCount(data.receiverRatingCount ?? 0);
      } catch (e) {
        if (!mounted) return;
        console.warn('receiver profile preview rating load failed:', getErrorMessage(e));
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile Preview</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.card}>
        {user?.profileImage ? (
          <Image source={{ uri: user.profileImage }} style={styles.avatar} />
        ) : (
          <View style={styles.avatar} />
        )}
        <Text style={styles.name}>{user?.name ?? 'Receiver'}</Text>
        <Text style={styles.meta}>
          {[user?.interests?.[0], user?.interests?.[1], user?.interests?.[2]]
            .filter(Boolean)
            .join(' | ') || (user?.state ?? 'State not set')}
        </Text>
        <Text style={styles.rating}>{ratingAvg} ★ ({ratingCount})</Text>
        <Text style={styles.lastSeen}>Last Seen: {new Date().toLocaleTimeString()}</Text>
      </View>

      <Section label="Languages spoken" value={(user?.languages ?? []).join(', ') || 'Not set'} />
      <Section label="Interests" value={(user?.interests ?? []).join(', ') || 'Not set'} />
      <Section
        label="Audio call rate"
        value={typeof user?.audioCallRate === 'number' ? `₹${user.audioCallRate}/min` : 'Not set'}
      />

      <View style={styles.actionsRow}>
        <TouchableOpacity style={[styles.actionBtn, styles.primaryAction]}>
          <Text style={styles.primaryActionText}>Voice Call</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionText}>Message</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={styles.sectionValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f8' },
  screen: { flex: 1, backgroundColor: '#f7f7f8' },
  content: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 20, color: '#111', fontWeight: '700' },
  headerTitle: { fontSize: 16, color: '#111', fontWeight: '900' },
  card: {
    alignItems: 'center',
    backgroundColor: '#e97cdd',
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#da61cd',
    padding: 16,
  },
  avatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: 'rgba(255,255,255,0.45)',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#fff',
  },
  name: { fontSize: 17, color: '#1f1f1f', fontWeight: '900' },
  meta: { marginTop: 4, color: '#fff', fontSize: 11, fontWeight: '700', opacity: 0.95 },
  rating: { marginTop: 6, color: '#ffd84d', fontSize: 14, fontWeight: '900' },
  lastSeen: { marginTop: 6, color: '#fff', fontSize: 10, fontWeight: '700', opacity: 0.9 },
  section: {
    marginTop: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ececec',
    borderRadius: 12,
    padding: 12,
  },
  sectionLabel: { fontSize: 12, color: '#666', fontWeight: '700' },
  sectionValue: { marginTop: 6, fontSize: 13, color: '#222', fontWeight: '700' },
  actionsRow: { marginTop: 14, flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 11,
    backgroundColor: '#fff',
  },
  primaryAction: { borderColor: '#c9b0ff', backgroundColor: '#f5ecff' },
  actionText: { color: '#333', fontSize: 12, fontWeight: '700' },
  primaryActionText: { color: '#7b2cff', fontSize: 12, fontWeight: '800' },
});
