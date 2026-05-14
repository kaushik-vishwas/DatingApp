import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
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
            <Icon name="chevron-left" size={24} color="#1a1a1a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.backBtn} />
        </View>

        <Text style={styles.sectionTitle}>ACCOUNT</Text>

        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ReceiverEditProfile')}>
          <View style={styles.rowLeft}>
            <View style={styles.iconCircle}>
              <Icon name="user" size={18} color="#7B2CFF" />
            </View>
            <Text style={styles.label}>Profile Management</Text>
          </View>
          <Icon name="chevron-right" size={18} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ReceiverHowToEarn')}>
          <View style={styles.rowLeft}>
            <View style={styles.iconCircle}>
              <Icon name="trending-up" size={18} color="#7B2CFF" />
            </View>
            <Text style={styles.label}>How to Earn</Text>
          </View>
          <Icon name="chevron-right" size={18} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ReceiverNotifications')}>
          <View style={styles.rowLeft}>
            <View style={styles.iconCircle}>
              <Icon name="bell" size={18} color="#7B2CFF" />
            </View>
            <Text style={styles.label}>Notifications</Text>
          </View>
          <Icon name="chevron-right" size={18} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ReceiverBankDetails')}>
          <View style={styles.rowLeft}>
            <View style={styles.iconCircle}>
              <Icon name="credit-card" size={18} color="#7B2CFF" />
            </View>
            <Text style={styles.label}>Bank Details</Text>
          </View>
          <Icon name="chevron-right" size={18} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ReceiverDeleteAccount')}>
          <View style={styles.rowLeft}>
            <View style={[styles.iconCircle, styles.dangerIconCircle]}>
              <Icon name="trash-2" size={18} color="#dc2626" />
            </View>
            <Text style={[styles.label, styles.danger]}>Delete Account</Text>
          </View>
          <Icon name="chevron-right" size={18} color="#dc2626" />
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
          <View style={styles.rowLeft}>
            <View style={[styles.iconCircle, styles.logoutIconCircle]}>
              <Icon name="log-out" size={18} color="#dc2626" />
            </View>
            <Text style={styles.logoutText}>Log out</Text>
          </View>
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
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#111' },
  sectionTitle: { fontSize: 11, color: '#9a9a9a', fontWeight: '800', marginBottom: 8, letterSpacing: 0.5 },
  
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
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerIconCircle: {
    backgroundColor: '#fee2e2',
  },
  logoutIconCircle: {
    backgroundColor: '#fee2e2',
  },
  label: { fontSize: 14, color: '#222', fontWeight: '600' },
  chev: { fontSize: 14, color: '#777', fontWeight: '700' },
  danger: { color: '#dc2626' },
  logout: {
    marginTop: 10,
    backgroundColor: '#fff',
    borderColor: '#f2c8c8',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  logoutText: { color: '#dc2626', fontSize: 14, fontWeight: '700' },
});