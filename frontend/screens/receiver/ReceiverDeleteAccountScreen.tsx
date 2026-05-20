import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverDeleteAccount'>;

export default function ReceiverDeleteAccountScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const { signOut } = useAuth();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const reasons = [
    "I'm not using this app anymore",
    'Technical issues or poor experience',
    'Calling Services Not Good',
    'Too expensive / coins cost is high',
    "I didn't found what I was looking for",
  ];

  const onDelete = () => {
    if (!reason) {
      Alert.alert('Select a reason', 'Please select an appropriate reason.');
      return;
    }
    Alert.alert('Delete account', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await profileApi.deleteReceiverAccount({ reason });
            await signOut();
          } catch (e) {
            Alert.alert('Delete failed', getErrorMessage(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Delete Account</Text>
        <View style={styles.backBtn} />
      </View>

      {/* <Text style={styles.title}>Delete Account</Text> */}
      <Text style={styles.note}>
        We're really sorry to see you go. Are you sure you want to delete your account? Once you confirm, your data will be gone.
      </Text>
      <Text style={[styles.note, { marginTop: 18 }]}>Please select an appropriate reason</Text>

      <View style={{ marginTop: 8, gap: 8 }}>
        {reasons.map((item) => {
          const selected = reason === item;
          return (
            <TouchableOpacity key={item} style={styles.reasonRow} onPress={() => setReason(item)}>
              <View style={[styles.radio, selected && styles.radioActive]} />
              <Text style={styles.reasonText}>{item}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={[styles.deleteBtn, busy && styles.disabled]} disabled={busy} onPress={onDelete}>
        <Text style={styles.deleteText}>{busy ? 'Deleting...' : 'Delete Account'}</Text>
      </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
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
  title: { fontSize: 22, color: '#b91c1c', fontWeight: '900', marginBottom: 12 },
  note: { fontSize: 12, color: '#555', fontWeight: '700', marginBottom: 6, marginTop: 16 },
  reasonRow: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ececec',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reasonText: { fontSize: 12, color: '#222', fontWeight: '600' },
  radio: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#bbb',
    backgroundColor: '#fff',
  },
  radioActive: { backgroundColor: '#7b2cff', borderColor: '#7b2cff' },
  deleteBtn: {
    marginTop: 18,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  deleteText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.6 },
});
