import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverSettings'>;

export default function ReceiverSettingsScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const { signOut } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backBtn} />
      </View>

      <Text style={styles.sectionTitle}>ACCOUNT</Text>

      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ReceiverEditProfile')}>
        <Text style={styles.label}>Profile Management</Text>
        <Text style={styles.chev}>{'>'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ReceiverNotifications')}>
        <Text style={styles.label}>Notifications</Text>
        <Text style={styles.chev}>{'>'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ReceiverBankDetails')}>
        <Text style={styles.label}>Bank Details</Text>
        <Text style={styles.chev}>{'>'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ReceiverDeleteAccount')}>
        <Text style={[styles.label, styles.danger]}>Delete Account</Text>
        <Text style={[styles.chev, styles.danger]}>{'>'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.logout}
        onPress={() =>
          Alert.alert('Log out', 'Do you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: () => signOut() },
          ])
        }
      >
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f8' },
  screen: { flex: 1, backgroundColor: '#f7f7f8' },
  content: { padding: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { fontSize: 20, color: '#111', fontWeight: '700' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#111' },
  sectionTitle: { fontSize: 11, color: '#9a9a9a', fontWeight: '800', marginBottom: 8 },
  row: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ececec',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  label: { fontSize: 14, color: '#222', fontWeight: '700' },
  chev: { fontSize: 14, color: '#777', fontWeight: '700' },
  danger: { color: '#dc2626' },
  logout: {
    marginTop: 10,
    backgroundColor: '#fff',
    borderColor: '#f2c8c8',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  logoutText: { color: '#dc2626', fontSize: 14, fontWeight: '800' },
});
