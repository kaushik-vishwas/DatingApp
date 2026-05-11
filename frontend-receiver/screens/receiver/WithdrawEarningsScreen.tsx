import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage, getJwt, getResolvedApiBaseUrl, profileApi } from '../../services/api';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import type { ReceiverWithdrawalOverviewResponse } from '../../types/api';

type WithdrawNav = NativeStackNavigationProp<ReceiverStackParamList, 'WithdrawEarnings'>;
type Step = 'amount' | 'otp' | 'processing' | 'success' | 'failed';

function formatInr(n: number): string {
  return `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export default function WithdrawEarningsScreen(): React.JSX.Element {
  const navigation = useNavigation<WithdrawNav>();
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [overview, setOverview] = useState<ReceiverWithdrawalOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [step, setStep] = useState<Step>('amount');
  const [currentWithdrawalId, setCurrentWithdrawalId] = useState<string | null>(null);

  const loadOverview = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const { data } = await profileApi.receiverWithdrawalOverview();
      setOverview(data);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadOverview();
    }, [loadOverview])
  );

  const parsedAmount = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }, [amount]);

  const maskedMobile = useMemo(() => {
    const d = String(user?.phone ?? '').replace(/\D/g, '');
    if (d.length < 4) return d || 'your mobile';
    return `******${d.slice(-4)}`;
  }, [user?.phone]);

  const isIdentityComplete = useMemo(() => {
    if (!user) return false;
    const aadhaarDigits = String(user.aadhaarNumber ?? '').replace(/\D/g, '');
    const pan = String(user.panNumber ?? '').trim().toUpperCase();
    return Boolean(
      user.aadhaarFront?.trim() &&
        user.aadhaarBack?.trim() &&
        user.panFront?.trim() &&
        /^\d{12}$/.test(aadhaarDigits) &&
        /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan),
    );
  }, [user]);

  const isBankDetailsComplete = useMemo(() => {
    if (!overview) return false;
    return Boolean(
      overview.bank.bankName?.trim() &&
        overview.bank.accountHolderName?.trim() &&
        overview.bank.accountMasked?.trim(),
    );
  }, [overview]);

  const getWithdrawKycAction = useCallback(() => {
    if (!isIdentityComplete) {
      return {
        title: 'Complete KYC',
        subtitle: 'First complete Aadhaar/PAN details and documents.',
        onPress: () => navigation.navigate('ReceiverEditProfile', { fromWithdrawKyc: true }),
      };
    }
    return {
      title: 'Complete KYC',
      subtitle: 'Now complete your bank account details.',
      onPress: () => navigation.navigate('ReceiverBankDetails'),
    };
  }, [isIdentityComplete, navigation]);

  const ensureWithdrawKycReady = useCallback((): boolean => {
    if (!isIdentityComplete) {
      Alert.alert('Complete KYC', 'Please complete Verify Your Identity first.');
      navigation.navigate('ReceiverEditProfile', { fromWithdrawKyc: true });
      return false;
    }
    if (!isBankDetailsComplete) {
      Alert.alert('Complete KYC', 'Please complete Apply for KYC bank details.');
      navigation.navigate('ReceiverBankDetails');
      return false;
    }
    return true;
  }, [isIdentityComplete, isBankDetailsComplete, navigation]);

  const onSendOtp = async () => {
    if (!overview) return;
    if (!ensureWithdrawKycReady()) return;
    if (!Number.isFinite(parsedAmount) || parsedAmount < 1) {
      Alert.alert('Invalid amount', 'Enter a valid withdrawal amount.');
      return;
    }
    if (parsedAmount > overview.walletBalance) {
      Alert.alert('Insufficient balance', 'Withdrawal amount is greater than your available wallet.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await profileApi.sendReceiverWithdrawalOtp(parsedAmount);
      setOtp('');
      setStep('otp');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onVerifyOtp = async () => {
    if (!/^\d{6}$/.test(otp.trim())) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit OTP sent to your mobile.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setStep('processing');
      const { data } = await profileApi.verifyReceiverWithdrawalOtp(otp.trim());
      setCurrentWithdrawalId(data.withdrawal.id);
      await loadOverview({ silent: true });
    } catch (e) {
      setError(getErrorMessage(e));
      setStep('failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (step !== 'processing' || !currentWithdrawalId) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const { data } = await profileApi.receiverWithdrawalOverview();
          if (cancelled) return;
          setOverview(data);
          const row = data.recent.find((r) => r.id === currentWithdrawalId);
          if (!row?.payoutStatus) return;
          if (row.payoutStatus === 'success') {
            setStep('success');
            Alert.alert('Payment successful', 'Withdrawal credited successfully.');
          } else if (row.payoutStatus === 'failed') {
            setStep('failed');
            Alert.alert('Payment failed', 'Payment is failed.');
          }
        } catch {
          // keep polling on transient failures
        }
      })();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [step, currentWithdrawalId]);

  useEffect(() => {
    let cancelled = false;
    const base = getResolvedApiBaseUrl();
    let socket: Socket | null = null;
    void (async () => {
      const token = await getJwt();
      if (!token || cancelled) return;
      socket = io(base, {
        auth: { token },
        transports: ['polling', 'websocket'],
        timeout: 20000,
      });
      socket.on(
        'withdrawal:update',
        (payload: { withdrawalId?: string; payoutStatus?: 'processing' | 'success' | 'failed' }) => {
          if (!payload?.withdrawalId) return;
          if (currentWithdrawalId && payload.withdrawalId !== currentWithdrawalId) return;
          if (payload.payoutStatus === 'processing') {
            setStep('processing');
          } else if (payload.payoutStatus === 'success') {
            setStep('success');
            Alert.alert('Payment successful', 'Withdrawal credited successfully.');
          } else if (payload.payoutStatus === 'failed') {
            setStep('failed');
            Alert.alert('Payment failed', 'Payment is failed.');
          }
          void loadOverview({ silent: true });
        }
      );
    })();
    return () => {
      cancelled = true;
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
    };
  }, [currentWithdrawalId, loadOverview]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7b2cff" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Withdraw Earnings</Text>
        <View style={{ width: 14 }} />
      </View>

      {(!isIdentityComplete || !isBankDetailsComplete) ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Action Required</Text>
          <Text style={styles.infoText}>{getWithdrawKycAction().subtitle}</Text>
          <TouchableOpacity style={styles.infoBtn} onPress={getWithdrawKycAction().onPress}>
            <Text style={styles.infoBtnText}>Complete KYC</Text>
          </TouchableOpacity>
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}

      {overview ? (
        <>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Available Balance</Text>
            <Text style={styles.balanceAmount}>{formatInr(overview.walletBalance)}</Text>
            <Text style={styles.balanceSub}>Withdraw your earnings to your bank account</Text>
          </View>

          <Text style={styles.sectionLabel}>Enter Withdrawal Amount</Text>
          <View style={styles.inputWrap}>
            <Text style={styles.currency}>₹</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor="#aaa"
              editable={!busy && step !== 'success' && step !== 'processing'}
            />
          </View>
          {/* <Text style={styles.deductNote}>+ 18% GST will be deducted</Text> */}

          <Text style={styles.sectionLabel}>Quick Select</Text>
          <View style={styles.quickRow}>
            {[500, 1000, 2000, 5000].map((v) => (
              <TouchableOpacity key={v} style={styles.quickBtn} onPress={() => setAmount(String(v))}>
                <Text style={styles.quickText}>{formatInr(v)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.bankCard}>
            <View style={styles.bankRow}>
              <Text style={styles.bankTitle}>Withdrawal will be sent to</Text>
              <View />
            </View>
            <Text style={styles.bankName}>{overview.bank.bankName}</Text>
            <Text style={styles.bankAcc}>{overview.bank.accountMasked}</Text>
            <Text style={styles.bankHolder}>{overview.bank.accountHolderName}</Text>
          </View>

          {step === 'amount' ? (
            <TouchableOpacity
              style={[styles.primaryBtn, (busy || !amount.trim()) && styles.primaryBtnDisabled]}
              onPress={onSendOtp}
              disabled={busy || !amount.trim()}
            >
              <Text style={styles.primaryText}>{busy ? 'Sending OTP...' : 'Continue'}</Text>
            </TouchableOpacity>
          ) : null}

          {step === 'otp' ? (
            <View style={styles.otpCard}>
              <Text style={styles.otpTitle}>Enter Verification Code</Text>
              <Text style={styles.otpSub}>We sent a 6-digit OTP to {maskedMobile}</Text>
              <TextInput
                style={styles.otpInput}
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={setOtp}
                placeholder="------"
                placeholderTextColor="#bbb"
                editable={!busy}
              />
              <View style={styles.otpActions}>
                <TouchableOpacity
                  onPress={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await profileApi.sendReceiverWithdrawalOtp(parsedAmount);
                    } catch (e) {
                      setError(getErrorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy}
                >
                  <Text style={styles.resendText}>Resend code</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]} onPress={onVerifyOtp} disabled={busy}>
                  <Text style={styles.primaryText}>{busy ? 'Verifying...' : 'Verify & Continue'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {step === 'processing' ? (
            <View style={styles.successCard}>
              <ActivityIndicator size="large" color="#7b2cff" />
              <Text style={styles.successTitle}>Please wait...</Text>
              <Text style={styles.successSub}>Payment is processing.</Text>
            </View>
          ) : null}

          {step === 'success' ? (
            <View style={styles.successCard}>
              <Text style={styles.successTitle}>Payment Successful!</Text>
              <Text style={styles.successSub}>Amount credited to your bank account.</Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => {
                  setStep('amount');
                  setAmount('');
                  setOtp('');
                  setCurrentWithdrawalId(null);
                }}
              >
                <Text style={styles.primaryText}>Go Back</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {step === 'failed' ? (
            <View style={styles.successCard}>
              <Text style={styles.successTitle}>Payment Failed</Text>
              <Text style={styles.successSub}>No money was deducted. Please try again.</Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => {
                  setStep('amount');
                  setAmount('');
                  setOtp('');
                  setCurrentWithdrawalId(null);
                }}
              >
                <Text style={styles.primaryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.historyWrap}>
            <Text style={styles.sectionLabel}>Recent Withdrawals</Text>
            {overview.recent.length === 0 ? (
              <Text style={styles.emptyHistory}>No withdrawals yet.</Text>
            ) : (
              overview.recent.slice(0, 5).map((row) => (
                <View key={row.id} style={styles.historyRow}>
                  <View>
                    <Text style={styles.historyAmount}>{formatInr(row.amount)}</Text>
                    <Text style={styles.historyDate}>{formatDate(row.createdAt)}</Text>
                  </View>
                  <Text style={styles.historyStatus}>
                    {row.payoutStatus
                      ? row.payoutStatus[0].toUpperCase() + row.payoutStatus.slice(1)
                      : row.status}
                  </Text>
                </View>
              ))
            )}
          </View>
        </>
      ) : (
        <View style={styles.emptyStateCard}>
          <Text style={styles.emptyStateTitle}>Withdraw Earnings</Text>
          <Text style={styles.emptyStateSub}>
            Complete your required details to continue the withdrawal flow.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={getWithdrawKycAction().onPress}>
            <Text style={styles.primaryText}>Complete Required Details</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => void loadOverview()}>
            <Text style={styles.secondaryBtnText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f8' },
  screen: { flex: 1, backgroundColor: '#f7f7f8' },
  content: { padding: 16, paddingBottom: 36 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  back: { fontSize: 20, color: '#111', fontWeight: '700' },
  title: { fontSize: 20, fontWeight: '800', color: '#111' },
  error: { color: '#b91c1c', fontSize: 12, fontWeight: '700', marginBottom: 10 },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f0d8b0',
    padding: 12,
    marginBottom: 10,
  },
  infoTitle: { fontSize: 13, fontWeight: '800', color: '#7a4b00' },
  infoText: { marginTop: 4, fontSize: 12, color: '#5f5f5f' },
  infoBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#7b2cff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  infoBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  balanceCard: {
    backgroundColor: '#eb83da',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  balanceLabel: { fontSize: 12, color: '#fff', opacity: 0.95, fontWeight: '700' },
  balanceAmount: { fontSize: 34, color: '#fff', fontWeight: '900', marginTop: 4 },
  balanceSub: { marginTop: 6, fontSize: 11, color: '#fff', opacity: 0.9 },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: '#232323', marginTop: 8, marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dfdfdf',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  currency: { fontSize: 18, fontWeight: '700', color: '#222' },
  input: { flex: 1, fontSize: 22, color: '#111', paddingVertical: 10, marginLeft: 8, fontWeight: '700' },
  deductNote: { fontSize: 11, color: '#777', marginTop: 6, textAlign: 'right' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  quickBtn: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  quickText: { fontSize: 12, color: '#333', fontWeight: '700' },
  bankCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e3e3e3',
    backgroundColor: '#fff',
  },
  bankRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bankTitle: { fontSize: 11, color: '#666', fontWeight: '700', marginBottom: 4 },
  bankName: { fontSize: 13, color: '#222', fontWeight: '700' },
  bankAcc: { fontSize: 12, color: '#666', marginTop: 2 },
  bankHolder: { fontSize: 11, color: '#7b2cff', marginTop: 5, fontWeight: '700' },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: '#7b2cff',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  otpCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7e1ff',
    backgroundColor: '#fff',
  },
  otpTitle: { fontSize: 16, fontWeight: '800', color: '#222', textAlign: 'center' },
  otpSub: { marginTop: 6, fontSize: 12, color: '#666', textAlign: 'center' },
  otpInput: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 24,
    letterSpacing: 6,
    textAlign: 'center',
    color: '#111',
    backgroundColor: '#fafafa',
    paddingVertical: 8,
  },
  otpActions: { marginTop: 10, gap: 8 },
  resendText: { textAlign: 'center', color: '#7b2cff', fontSize: 12, fontWeight: '700' },
  successCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2d7ff',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  successTitle: { fontSize: 20, color: '#212121', fontWeight: '900' },
  successSub: { marginTop: 6, fontSize: 12, color: '#6a6a6a' },
  historyWrap: { marginTop: 18 },
  emptyHistory: { color: '#777', fontSize: 12, marginTop: 4 },
  historyRow: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ececec',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyAmount: { color: '#111', fontWeight: '800', fontSize: 13 },
  historyDate: { color: '#777', fontSize: 11, marginTop: 2 },
  historyStatus: { color: '#7b2cff', fontWeight: '700', textTransform: 'capitalize', fontSize: 12 },
  emptyStateCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    padding: 14,
    marginTop: 8,
  },
  emptyStateTitle: { fontSize: 16, fontWeight: '800', color: '#202020' },
  emptyStateSub: { marginTop: 6, fontSize: 12, color: '#666' },
  secondaryBtn: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d7c7ff',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  secondaryBtnText: { color: '#7b2cff', fontSize: 14, fontWeight: '800' },
});
