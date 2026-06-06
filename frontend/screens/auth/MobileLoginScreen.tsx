import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '../../context/AuthContext';
import type { RootStackParamList } from '../../navigation/RootStackParamList';
import { authApi, getErrorMessage, saveJwt } from '../../services/api';
import { normalizeIndianMobileDigits } from '../../utils/validation';
import { PRIVACY_POLICY_CONTENT } from '../../constants/privacyPolicyContent';
import SelectoLogo from '../../assets/SelectoLogo.png';




// Add these imports with your existing ones
import BannerImage1 from '../../assets/LoginPic/loginPic1.png';
import BannerImage2 from '../../assets/LoginPic/loginPic2.png';
import BannerImage3 from '../../assets/LoginPic/loginPic3.png';
import BannerImage4 from '../../assets/LoginPic/loginPic4.png';

type Props = NativeStackScreenProps<RootStackParamList, 'MobileLogin'>;

type Step = 'mobile' | 'otp';

interface CountryCode {
  code: string;
  dialCode: string;
  flag: string;
  name: string;
}

const countryCodes: CountryCode[] = [
  { code: 'IN', dialCode: '+91', flag: '🇮🇳', name: 'India' },
  { code: 'US', dialCode: '+1', flag: '🇺🇸', name: 'USA' },
  { code: 'GB', dialCode: '+44', flag: '🇬🇧', name: 'UK' },
  { code: 'CA', dialCode: '+1', flag: '🇨🇦', name: 'Canada' },
  { code: 'AU', dialCode: '+61', flag: '🇦🇺', name: 'Australia' },
  { code: 'AE', dialCode: '+971', flag: '🇦🇪', name: 'UAE' },
  { code: 'SG', dialCode: '+65', flag: '🇸🇬', name: 'Singapore' },
  { code: 'MY', dialCode: '+60', flag: '🇲🇾', name: 'Malaysia' },
  { code: 'NZ', dialCode: '+64', flag: '🇳🇿', name: 'New Zealand' },
  { code: 'DE', dialCode: '+49', flag: '🇩🇪', name: 'Germany' },
  { code: 'FR', dialCode: '+33', flag: '🇫🇷', name: 'France' },
  { code: 'IT', dialCode: '+39', flag: '🇮🇹', name: 'Italy' },
  { code: 'ES', dialCode: '+34', flag: '🇪🇸', name: 'Spain' },
  { code: 'BR', dialCode: '+55', flag: '🇧🇷', name: 'Brazil' },
  { code: 'MX', dialCode: '+52', flag: '🇲🇽', name: 'Mexico' },
  { code: 'JP', dialCode: '+81', flag: '🇯🇵', name: 'Japan' },
  { code: 'KR', dialCode: '+82', flag: '🇰🇷', name: 'South Korea' },
  { code: 'CN', dialCode: '+86', flag: '🇨🇳', name: 'China' },
  { code: 'ZA', dialCode: '+27', flag: '🇿🇦', name: 'South Africa' },
  { code: 'NG', dialCode: '+234', flag: '🇳🇬', name: 'Nigeria' },
];

const bannerImages = [
  { id: '1', image: BannerImage1, title: '' },
  { id: '2', image: BannerImage2, title: '' },
  { id: '3', image: BannerImage3, title: '' },
  { id: '4', image: BannerImage4, title: '' },
];

const { width } = Dimensions.get('window');
const HORIZONTAL_PADDING = 20;
const BANNER_WIDTH = width - (HORIZONTAL_PADDING * 2);
const PURPLE = '#7F00FF';

export default function MobileLoginScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [mobile, setMobile] = useState('');
  const [step, setStep] = useState<Step>('mobile');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(countryCodes[0]);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const [resendEnabled, setResendEnabled] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoSlideRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-slide effect
  useEffect(() => {
    if (flatListRef.current && bannerImages.length > 1) {
      autoSlideRef.current = setInterval(() => {
        let nextIndex = activeBannerIndex + 1;
        if (nextIndex >= bannerImages.length) {
          nextIndex = 0;
        }
        flatListRef.current?.scrollToIndex({
          index: nextIndex,
          animated: true,
        });
        setActiveBannerIndex(nextIndex);
      }, 3000);
    }

    return () => {
      if (autoSlideRef.current) {
        clearInterval(autoSlideRef.current);
      }
    };
  }, [activeBannerIndex]);

  // Resend timer effect
  useEffect(() => {
    if (resendTimer > 0) {
      timerRef.current = setTimeout(() => {
        setResendTimer(resendTimer - 1);
      }, 1000);
    } else if (resendTimer === 0 && resendEnabled === false) {
      setResendEnabled(true);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [resendTimer, resendEnabled]);

  /** API uses canonical 10-digit Indian mobile (matches DB and other auth screens). */
  const getPhoneForApi = useCallback(() => normalizeIndianMobileDigits(mobile), [mobile]);

  const scrollToFocusedInput = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        const responder = TextInput.State.currentlyFocusedInput?.();
        if (!responder || !scrollRef.current) return;
        scrollRef.current.getScrollResponder()?.scrollResponderScrollNativeHandleToKeyboard(responder, 120, true);
      }, 30);
    });
  }, []);

  const onSendOtp = async () => {
    if (!privacyAccepted) {
      Alert.alert('Privacy Policy', 'Please accept the Privacy Policy to continue.');
      return;
    }
    const digitsOnly = mobile.replace(/\D/g, '');
    // Restrict to exactly 10 digits
    if (digitsOnly.length !== 10) {
      Alert.alert('Validation', `Please enter exactly 10 digits (currently ${digitsOnly.length} digits).`);
      return;
    }
    setLoading(true);
    try {
      const phone = getPhoneForApi();
      await authApi.sendMobileOtp(phone);
      setOtp('');
      setStep('otp');
      // Reset resend timer
      setResendEnabled(false);
      setResendTimer(60);
    } catch (e) {
      Alert.alert('Could not send OTP', getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOtp = async () => {
    const code = otp.trim();
    if (!/^\d{6}$/.test(code)) {
      Alert.alert('Validation', 'Enter a valid 6-digit OTP.');
      return;
    }
    setLoading(true);
    try {
      const phone = getPhoneForApi();
      const { data } = await authApi.verifyMobileOtp(phone, code);
      if (data.status === 'needs_gender') {
        navigation.navigate('AuthGender', { phone: data.phone });
        return;
      }
      if (!data.token) {
        Alert.alert('Error', 'No token returned from server');
        return;
      }
      await saveJwt(data.token);
      signIn(data.token, data.user);
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const onResendOtp = async () => {
    if (!resendEnabled) {
      Alert.alert('Please wait', `You can resend OTP after ${resendTimer} seconds`);
      return;
    }
    await onSendOtp();
  };

  const renderBannerItem = ({ item }: { item: typeof bannerImages[0] }) => (
    <View style={[styles.bannerSlide, { width: BANNER_WIDTH }]}>
      <Image source={item.image} style={styles.bannerImage} />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.7)']}
        style={styles.bannerOverlay}
      >
        <Text style={styles.bannerTitle}>{item.title}</Text>
      </LinearGradient>
    </View>
  );
  const onScrollBanner = (event: any) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / BANNER_WIDTH);
    if (activeBannerIndex !== index) {
      setActiveBannerIndex(index);
    }
  };

  const onMomentumScrollEnd = (event: any) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / BANNER_WIDTH);
    setActiveBannerIndex(index);
  };

  const renderDotsWithText = () => {
    return (
      <View style={styles.dotsWithTextContainer}>
        {/* Dots Row */}
        <View style={styles.dotsRow}>
          {bannerImages.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                activeBannerIndex === index ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>
      </View>
    );
  };

  const formatResendTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return `${secs}s`;
  };

  return (
    <View style={styles.bg}>
      {/* Logo at Absolute Top */}
      <View style={[styles.absoluteLogoContainer, { paddingTop: Math.max(insets.top, 10) }]}>
        <Image source={SelectoLogo} style={styles.logo} resizeMode="contain" />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
        enabled={Platform.OS === 'ios'}
      >
        <ScrollView
          ref={(r) => {
            scrollRef.current = r;
          }}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          onScrollBeginDrag={Keyboard.dismiss}
          showsVerticalScrollIndicator={false}
        >
          {/* Centered Content */}
          <View style={styles.centerContainer}>
            {/* Banner Slider with auto-slide */}
            <View style={styles.bannerContainer}>
              <FlatList
                ref={flatListRef}
                data={bannerImages}
                renderItem={renderBannerItem}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={onScrollBanner}
                onMomentumScrollEnd={onMomentumScrollEnd}
                scrollEventThrottle={16}
                keyExtractor={(item) => item.id}
                decelerationRate="fast"
                snapToInterval={BANNER_WIDTH}
                snapToAlignment="start"
                contentContainerStyle={styles.flatListContent}
              />
              {renderDotsWithText()}
            </View>

            {/* Centered Form Container */}
            <View style={styles.formContainer}>
              {step === 'mobile' ? (
                <>
                  <View style={styles.phoneInputContainer}>
                    <TouchableOpacity
                      style={styles.countrySelector}
                      onPress={() => setShowCountryDropdown(!showCountryDropdown)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
                      <Text style={styles.countryDialCode}>{selectedCountry.dialCode}</Text>
                      <Text style={styles.dropdownArrow}>▼</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={styles.phoneInput}
                      placeholder="Enter mobile number (10 digits)"
                      placeholderTextColor="#999"
                      keyboardType="phone-pad"
                      maxLength={10}
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={mobile}
                      onChangeText={(text) => {
                        // Only allow digits
                        const cleaned = text.replace(/[^0-9]/g, '');
                        setMobile(cleaned);
                      }}
                      onFocus={scrollToFocusedInput}
                    />
                  </View>

                  {showCountryDropdown && (
                    <View style={styles.countryDropdown}>
                      <ScrollView style={styles.countryScroll} nestedScrollEnabled>
                        {countryCodes.map((country) => (
                          <TouchableOpacity
                            key={country.code}
                            style={styles.countryOption}
                            onPress={() => {
                              setSelectedCountry(country);
                              setShowCountryDropdown(false);
                            }}
                          >
                            <Text style={styles.countryFlagOption}>{country.flag}</Text>
                            <Text style={styles.countryName}>{country.name}</Text>
                            <Text style={styles.countryDialCodeOption}>{country.dialCode}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter 6-digit OTP"
                    placeholderTextColor="#999"
                    keyboardType="number-pad"
                    maxLength={6}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={otp}
                    onChangeText={setOtp}
                    onFocus={scrollToFocusedInput}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      setStep('mobile');
                      setOtp('');
                      setResendEnabled(false);
                      setResendTimer(0);
                      if (timerRef.current) {
                        clearTimeout(timerRef.current);
                      }
                    }}
                    style={styles.changeNumber}
                  >
                    <Text style={styles.changeNumberText}>Change number</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={[
                  styles.buttonWrapper,
                  (loading || (step === 'mobile' && !privacyAccepted)) && styles.buttonDisabled,
                ]}
                onPress={() => void (step === 'mobile' ? onSendOtp() : onVerifyOtp())}
                disabled={loading || (step === 'mobile' && !privacyAccepted)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#7F00FF', '#A855F7', '#E100FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.button}
                >
                  <Text style={styles.buttonText}>
                    {loading ? 'Please wait…' : step === 'mobile' ? 'Get OTP' : 'Verify & continue'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {step === 'mobile' ? (
                <View style={styles.privacyRow}>
                  <TouchableOpacity
                    onPress={() => setPrivacyAccepted((v) => !v)}
                    activeOpacity={0.85}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}>
                      {privacyAccepted ? <Text style={styles.checkboxMark}>✓</Text> : null}
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.privacyText}>
                    I agree to the{' '}
                    <Text style={styles.privacyLink} onPress={() => setShowPrivacyModal(true)}>
                      Privacy Policy
                    </Text>
                  </Text>
                </View>
              ) : null}

              {step === 'otp' ? (
                <TouchableOpacity
                  style={[styles.resend, !resendEnabled && styles.resendDisabled]}
                  onPress={() => void onResendOtp()}
                  disabled={!resendEnabled}
                >
                  <Text style={[styles.resendText, !resendEnabled && styles.resendTextDisabled]}>
                    {resendEnabled ? 'Resend code' : `Resend code in ${formatResendTime(resendTimer)}`}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showPrivacyModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPrivacyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Privacy Policy</Text>
              <TouchableOpacity onPress={() => setShowPrivacyModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalContent}
            >
              <Text style={styles.modalBody}>{PRIVACY_POLICY_CONTENT}</Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setPrivacyAccepted(true);
                setShowPrivacyModal(false);
              }}
            >
              <Text style={styles.modalButtonText}>I Agree</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
  },
  absoluteLogoContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: 'center',
  },
  logo: {
    width: 140,
    height: 45,
    marginTop: 20,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  bannerContainer: {
    marginBottom: 32,
    width: '100%',
  },
  flatListContent: {
    paddingHorizontal: 0,
  },
  bannerSlide: {
    height: 215,
    borderRadius: 20,
    overflow: 'hidden',
    marginHorizontal: 0,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  dotsWithTextContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: 'pink',
    width: 10,
  },
  dotInactive: {
    backgroundColor: '#ccc',
  },
  formContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    height: 50,
  },
  countryFlag: {
    fontSize: 20,
    marginRight: 6,
  },
  countryDialCode: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginRight: 4,
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#999',
  },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 14,
    backgroundColor: '#fff',
    height: 50,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 14,
    marginBottom: 14,
    backgroundColor: '#fff',
    textAlign: 'center',
  },
  countryDropdown: {
    position: 'absolute',
    top: 70,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    maxHeight: 250,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  countryScroll: {
    maxHeight: 250,
  },
  countryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  countryFlagOption: {
    fontSize: 24,
    marginRight: 12,
  },
  countryName: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  countryDialCodeOption: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  changeNumber: {
    marginTop: 0,
    alignSelf: 'center',
  },
  changeNumberText: {
    color: '#7F00FF',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonWrapper: {
    width: '100%',
    marginTop: 16,
    borderRadius: 26,
    overflow: 'hidden',
  },
  button: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  resend: {
    marginTop: 14,
    alignItems: 'center',
  },
  resendDisabled: {
    opacity: 0.6,
  },
  resendText: {
    color: '#7F00FF',
    fontSize: 14,
    fontWeight: '600',
  },
  resendTextDisabled: {
    color: '#999',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',  // ← Add this to center horizontally
    width: '100%',
    marginTop: 14,
    paddingHorizontal: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#d0d0d0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 0,
  },
  checkboxChecked: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
  },
  checkboxMark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  privacyText: {
    color: '#444',  // ← Remove flex: 1
    fontSize: 13,
    lineHeight: 20,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },

  privacyLink: {
    color: PURPLE,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '90%',
    maxHeight: '85%',
    overflow: 'hidden',
    marginVertical: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#333',
  },
  modalClose: {
    fontSize: 22,
    color: '#666',
    padding: 4,
  },
  modalContent: {
    padding: 20,
    paddingBottom: 8,
  },
  modalBody: {
    fontSize: 14,
    color: '#444',
    lineHeight: 22,
  },
  modalButton: {
    margin: 16,
    marginTop: 8,
    backgroundColor: PURPLE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});