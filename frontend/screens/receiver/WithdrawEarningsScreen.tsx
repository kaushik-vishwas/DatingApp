import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import { LinearGradient } from 'expo-linear-gradient';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage, getJwt, getResolvedApiBaseUrl, profileApi } from '../../services/api';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import type { ReceiverWithdrawalOverviewResponse } from '../../types/api';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  computeReceiverWithdrawalBreakdown,
  RECEIVER_MIN_WITHDRAWAL_INR,
  RECEIVER_WITHDRAWAL_PLATFORM_FEE_PERCENT,
} from '../../utils/receiverWithdrawalFees';
import { receiverPaymentDetailsComplete } from '../../utils/receiverPaymentDetails';

type WithdrawNav = NativeStackNavigationProp<ReceiverStackParamList, 'WithdrawEarnings'>;
type Step = 'amount' | 'otp' | 'pending' | 'processing' | 'success' | 'failed';
type StatusModalStep = Extract<Step, 'pending' | 'processing' | 'success' | 'failed'>;

function formatInr(n: number): string {
  return `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function statusModalCopy(step: StatusModalStep): {
  icon: string;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  cta?: string;
} {
  switch (step) {
    case 'pending':
      return {
        icon: 'time-outline',
        iconColor: '#B45309',
        iconBg: '#FFF7ED',
        title: 'Request submitted',
        subtitle:
          'Your withdrawal is pending admin review. Money will be sent to your account after approval.',
        cta: 'Done',
      };
    case 'processing':
      return {
        icon: 'sync-outline',
        iconColor: '#7b2cff',
        iconBg: '#F5F0FF',
        title: 'Processing…',
        subtitle: 'Please wait while your payout is being processed.',
      };
    case 'success':
      return {
        icon: 'checkmark-circle',
        iconColor: '#059669',
        iconBg: '#ECFDF5',
        title: 'Payment successful',
        subtitle: 'The amount has been paid to your linked UPI or bank account.',
        cta: 'Done',
      };
    case 'failed':
      return {
        icon: 'close-circle',
        iconColor: '#DC2626',
        iconBg: '#FEF2F2',
        title: 'Withdrawal not completed',
        subtitle: 'No money was deducted. You can try again or contact support if this continues.',
        cta: 'Try again',
      };
  }
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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

  const withdrawalBreakdown = useMemo(() => {
    if (parsedAmount < RECEIVER_MIN_WITHDRAWAL_INR) return null;
    return computeReceiverWithdrawalBreakdown(parsedAmount);
  }, [parsedAmount]);

  const minWithdrawalInr = overview?.minWithdrawalInr ?? RECEIVER_MIN_WITHDRAWAL_INR;
  const platformFeePercent = overview?.platformFeePercent ?? RECEIVER_WITHDRAWAL_PLATFORM_FEE_PERCENT;

  const maskedMobile = useMemo(() => {
    const d = String(user?.phone ?? '').replace(/\D/g, '');
    if (d.length < 4) return d || 'your mobile';
    return `******${d.slice(-4)}`;
  }, [user?.phone]);

  const isPaymentComplete = useMemo(() => {
    if (overview?.payment?.complete) return true;
    return receiverPaymentDetailsComplete(user);
  }, [overview?.payment?.complete, user]);

  const handleCompletePaymentDetails = useCallback(() => {
    navigation.navigate('ReceiverBankDetails', { returnToWithdraw: true });
  }, [navigation]);

  const resetFlow = useCallback(() => {
    setStep('amount');
    setAmount('');
    setOtp('');
    setCurrentWithdrawalId(null);
    setStatusMessage(null);
    setError(null);
  }, []);

  const ensurePaymentReady = useCallback((): boolean => {
    if (!isPaymentComplete) {
      setError('Add payout details (UPI or bank account) to withdraw.');
      navigation.navigate('ReceiverBankDetails', { returnToWithdraw: true });
      return false;
    }
    return true;
  }, [isPaymentComplete, navigation]);

  const onSendOtp = async () => {
    if (!overview) return;
    if (!ensurePaymentReady()) return;
    if (!Number.isFinite(parsedAmount) || parsedAmount < minWithdrawalInr) {
      setError(`Minimum withdrawal is ${formatInr(minWithdrawalInr)}.`);
      return;
    }
    if (parsedAmount > overview.walletBalance) {
      setError('Withdrawal amount is greater than your available wallet.');
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
      setError('Please enter the 6-digit OTP sent to your mobile.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data } = await profileApi.verifyReceiverWithdrawalOtp(otp.trim());
      setCurrentWithdrawalId(data.withdrawal.id);
      await loadOverview({ silent: true });
      setStatusMessage('Your withdrawal is pending admin approval. Money will be sent after review.');
      setStep('pending');
    } catch (e) {
      const msg = getErrorMessage(e);
      setError(msg);
      setStatusMessage(msg);
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
          if (!row) return;
          if (row.status === 'pending' && (!row.payoutStatus || row.payoutStatus === 'none')) {
            setStatusMessage('Waiting for admin approval.');
            setStep('pending');
            return;
          }
          if (row.payoutStatus === 'success' || row.status === 'approved') {
            setStatusMessage('Withdrawal has been paid to your account.');
            setStep('success');
          } else if (row.payoutStatus === 'failed' || row.status === 'rejected') {
            setStatusMessage('Your withdrawal was not completed. Please try again or contact support.');
            setStep('failed');
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
        (payload: {
          withdrawalId?: string;
          payoutStatus?: 'processing' | 'success' | 'failed' | 'none';
          message?: string;
        }) => {
          if (!payload?.withdrawalId) return;
          if (currentWithdrawalId && payload.withdrawalId !== currentWithdrawalId) return;
          if (payload.payoutStatus === 'none') {
            setStatusMessage(payload.message || 'Waiting for admin approval.');
            setStep('pending');
          } else if (payload.payoutStatus === 'processing') {
            setStatusMessage(payload.message || 'Payment is processing.');
            setStep('processing');
          } else if (payload.payoutStatus === 'success') {
            setStatusMessage(payload.message || 'Withdrawal has been paid.');
            setStep('success');
          } else if (payload.payoutStatus === 'failed') {
            setStatusMessage(
              payload.message || 'Your withdrawal was not completed. Please try again or contact support.'
            );
            setStep('failed');
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

  const statusModalVisible =
    step === 'pending' || step === 'processing' || step === 'success' || step === 'failed';
  const statusCopy = statusModalVisible ? statusModalCopy(step) : null;
  const modalAmount = withdrawalBreakdown?.netPayout ?? (parsedAmount > 0 ? parsedAmount : null);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7b2cff" />
      </View>
    );
  }

  if (!isPaymentComplete) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.centeredContainer}>
          <View style={styles.topRow}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Icon name="chevron-back" size={28} color="#111" />
            </TouchableOpacity>
            <Text style={styles.title}>Withdraw Earnings</Text>
            <View style={{ width: 14 }} />
          </View>

          <View style={styles.centeredCard}>
            <Text style={styles.centeredTitle}>Action Required</Text>
            <Text style={styles.centeredSubtitle}>
              Add your payout details to withdraw. Name as per Aadhaar and Aadhaar number are optional.
            </Text>
            <TouchableOpacity onPress={handleCompletePaymentDetails} activeOpacity={0.8}>
              <LinearGradient
                colors={['#7F00FF', '#A855F7', '#E100FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.actionButton}
              >
                <Text style={styles.actionButtonText}>Add payment details</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
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
              <Icon name="arrow-back" size={24} color="#111" />
            </TouchableOpacity>
            <Text style={styles.title}>Withdraw Earnings</Text>
            <View style={{ width: 14 }} />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {overview ? (
            <>
              <View style={styles.balanceCard}>
                <Text style={styles.balanceLabel}>Available Balance</Text>
                <Text style={styles.balanceAmount}>{formatInr(overview.walletBalance)}</Text>
                <Text style={styles.balanceSub}>Withdraw your earnings to your UPI or bank account</Text>
              </View>

              <Text style={styles.sectionLabel}>Enter Withdrawal Amount</Text>
              <Text style={styles.minNote}>
                Minimum withdrawal {formatInr(minWithdrawalInr)}. A {platformFeePercent}% platform fee is deducted from
                your request (e.g. {formatInr(1000)} request → {formatInr(950)} to your UPI).
              </Text>
              <View style={styles.inputWrap}>
                <Text style={styles.currency}>₹</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  placeholderTextColor="#aaa"
                  editable={!busy && !statusModalVisible}
                />
              </View>

              {withdrawalBreakdown ? (
                <View style={styles.feeCard}>
                  <View style={styles.feeRow}>
                    <Text style={styles.feeLabel}>Withdrawal request</Text>
                    <Text style={styles.feeValue}>{formatInr(withdrawalBreakdown.requestedAmount)}</Text>
                  </View>
                  <View style={styles.feeRow}>
                    <Text style={styles.feeLabel}>Platform fee ({withdrawalBreakdown.platformFeePercent}%)</Text>
                    <Text style={styles.feeValue}>- {formatInr(withdrawalBreakdown.platformFee)}</Text>
                  </View>
                  <View style={[styles.feeRow, styles.feeRowTotal]}>
                    <Text style={styles.feeTotalLabel}>You receive</Text>
                    <Text style={styles.feeTotalValue}>{formatInr(withdrawalBreakdown.netPayout)}</Text>
                  </View>
                </View>
              ) : parsedAmount > 0 ? (
                <Text style={styles.minHint}>Enter at least {formatInr(minWithdrawalInr)} to withdraw.</Text>
              ) : null}

              <Text style={styles.sectionLabel}>Quick Select</Text>
              <View style={styles.quickRow}>
                {[200, 500, 1000, 2000].map((v) => (
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
                <Text style={styles.bankName}>{overview.bank.accountMasked || overview.payment?.upiMasked}</Text>
                <Text style={styles.bankAcc}>
                  {overview.payment?.payoutMethod === 'bank' ? 'Bank transfer (IMPS)' : 'UPI payout'}
                </Text>
                <Text style={styles.bankHolder}>
                  {overview.payment?.nameAsPerAadhaar ?? overview.bank.accountHolderName}
                </Text>
              </View>

              {step === 'amount' ? (
                <TouchableOpacity
                  style={[styles.primaryBtn, (busy || !amount.trim()) && styles.primaryBtnDisabled]}
                  onPress={onSendOtp}
                  disabled={busy || !amount.trim()}
                >
                  <LinearGradient
                    colors={['#7F00FF', '#A855F7', '#E100FF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryBtnInner}
                  >
                    <Text style={styles.primaryText}>{busy ? 'Sending OTP...' : 'Continue'}</Text>
                  </LinearGradient>
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
                    <TouchableOpacity
                      style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]}
                      onPress={onVerifyOtp}
                      disabled={busy}
                    >
                      <LinearGradient
                        colors={['#7F00FF', '#A855F7', '#E100FF']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.primaryBtnInner}
                      >
                        <Text style={styles.primaryText}>{busy ? 'Verifying...' : 'Verify & Continue'}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
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
                        <Text style={styles.historyAmount}>{formatInr(row.payoutAmount ?? row.amount)}</Text>
                        <Text style={styles.historyDate}>
                          {formatDate(row.createdAt)}
                          {row.platformFee ? ` · fee ${formatInr(row.platformFee)}` : ''}
                        </Text>
                      </View>
                      <Text style={styles.historyStatus}>
                        {row.status === 'pending'
                          ? 'Pending'
                          : row.status === 'rejected'
                            ? 'Rejected'
                            : row.payoutStatus
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
              <TouchableOpacity onPress={handleCompletePaymentDetails} activeOpacity={0.8}>
                <LinearGradient
                  colors={['#7F00FF', '#A855F7', '#E100FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryBtnInner}
                >
                  <Text style={styles.primaryText}>Complete Required Details</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => void loadOverview()}>
                <Text style={styles.secondaryBtnText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={statusModalVisible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={step === 'processing' ? undefined : resetFlow} />
          {statusCopy ? (
            <View style={styles.modalCard}>
              <View style={[styles.modalIconWrap, { backgroundColor: statusCopy.iconBg }]}>
                {step === 'processing' ? (
                  <ActivityIndicator size="large" color="#7b2cff" />
                ) : (
                  <Icon name={statusCopy.icon as 'time-outline'} size={40} color={statusCopy.iconColor} />
                )}
              </View>
              <Text style={styles.modalTitle}>{statusCopy.title}</Text>
              {modalAmount != null && step !== 'failed' ? (
                <Text style={styles.modalAmount}>{formatInr(modalAmount)}</Text>
              ) : null}
              <Text style={styles.modalSubtitle}>{statusMessage || statusCopy.subtitle}</Text>
              {statusCopy.cta ? (
                <TouchableOpacity style={styles.modalCta} onPress={resetFlow} activeOpacity={0.85}>
                  <LinearGradient
                    colors={
                      step === 'failed'
                        ? ['#DC2626', '#EF4444']
                        : step === 'success'
                          ? ['#059669', '#10B981']
                          : ['#7F00FF', '#A855F7', '#E100FF']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.modalCtaInner}
                  >
                    <Text style={styles.modalCtaText}>{statusCopy.cta}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f8' },
  screen: { flex: 1, backgroundColor: '#f7f7f8' },
  content: { padding: 16, paddingBottom: 36 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centeredContainer: { flex: 1, backgroundColor: '#f7f7f8', padding: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '800', color: '#111' },
  error: { color: '#b91c1c', fontSize: 12, fontWeight: '700', marginBottom: 10 },
  centeredCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  centeredTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
    marginBottom: 12,
    textAlign: 'center',
  },
  centeredSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  actionButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 200,
  },
  actionButtonText: { color: '#fff', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  balanceCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    backgroundColor: '#7b2cff',
  },
  balanceLabel: { fontSize: 12, color: '#fff', opacity: 0.95, fontWeight: '700' },
  balanceAmount: { fontSize: 34, color: '#fff', fontWeight: '900', marginTop: 4 },
  balanceSub: { marginTop: 6, fontSize: 11, color: '#fff', opacity: 0.9 },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: '#232323', marginTop: 8, marginBottom: 6 },
  minNote: { fontSize: 11, color: '#666', lineHeight: 16, marginBottom: 8 },
  minHint: { fontSize: 11, color: '#b45309', marginTop: 6 },
  feeCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ece6ff',
    backgroundColor: '#fff',
    gap: 6,
  },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feeRowTotal: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  feeLabel: { fontSize: 12, color: '#666' },
  feeValue: { fontSize: 12, color: '#333', fontWeight: '700' },
  feeTotalLabel: { fontSize: 13, color: '#111', fontWeight: '800' },
  feeTotalValue: { fontSize: 14, color: '#7b2cff', fontWeight: '900' },
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
    borderRadius: 10,
    overflow: 'hidden',
  },
  primaryBtnInner: {
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 17, 17, 0.45)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 22,
    backgroundColor: '#fff',
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  modalIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111',
    textAlign: 'center',
  },
  modalAmount: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '900',
    color: '#7b2cff',
    textAlign: 'center',
  },
  modalSubtitle: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: '#666',
    textAlign: 'center',
  },
  modalCta: {
    marginTop: 20,
    alignSelf: 'stretch',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalCtaInner: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCtaText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
