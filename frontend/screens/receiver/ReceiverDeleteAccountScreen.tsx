import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useAuth } from '../../context/AuthContext';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverDeleteAccount'>;

export default function ReceiverDeleteAccountScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const { user, applyServerUser } = useAuth();
  const alreadyRequested = Boolean(user?.accountDeletionRequestedAt);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(alreadyRequested);
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
    Alert.alert('Request account deletion', 'Admin will review this. Your account stays active until then.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send request',
        style: 'destructive',
        onPress: async () => {
          if (sent || alreadyRequested) {
            Alert.alert('Request already sent', 'Your delete request is already with admin.');
            return;
          }
          setBusy(true);
          try {
            const { data } = await profileApi.deleteReceiverAccount({ reason });
            setSent(true);
            if (user) {
              applyServerUser({
                ...user,
                accountDeletionRequestedAt: user.accountDeletionRequestedAt ?? new Date().toISOString(),
              });
            }
            if (data.alreadySent) {
              Alert.alert('Request already sent', 'Your delete request is already with admin.');
              return;
            }
            Alert.alert('Request sent', 'Admin has your delete request. Your account is still active.');
          } catch (e) {
            const message = getErrorMessage(e);
            if (/user not found/i.test(message)) {
              setSent(true);
              Alert.alert('Request already sent', 'Your delete request is already with admin.');
              return;
            }
            Alert.alert('Request failed', message);
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
          <Icon name="chevron-left" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Request deletion</Text>
        <View style={styles.placeholder} />
      </View>

      {/* <Text style={styles.title}>Delete Account</Text> */}
      <Text style={styles.note}>
        {sent
          ? 'Delete request is already sent. Your account stays active until admin deletes it.'
          : 'This sends a delete request to admin. Your account stays active until admin deletes it.'}
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

      <TouchableOpacity style={[styles.deleteBtn, (busy || sent) && styles.disabled]} disabled={busy || sent} onPress={onDelete}>
        <Text style={styles.deleteText}>{sent ? 'Request sent' : busy ? 'Sending...' : 'Request deletion'}</Text>
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
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#fff',
  },
  placeholder: { width: 36, height: 36 },
  headerTitle: { fontSize: 18, color: '#111', fontWeight: '900' },
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
