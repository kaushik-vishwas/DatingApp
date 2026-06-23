import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import axios from 'axios';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';

import VoiceVerificationRecorder from '../../components/VoiceVerificationRecorder';
import OnboardingLogoutButton from '../../components/auth/OnboardingLogoutButton';
import VoiceUploadDebugPanel from '../../components/VoiceUploadDebugPanel';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { VoiceVerificationResult } from '../../types/api';
import type { CloudinaryUploadDebugEntry } from '../../lib/cloudinary';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverAutoVerification'>;

const SCRIPT_TRANSLATIONS = {
  english:
    'Hello! Friendship is very special because good friends are always by our side; they increase our happiness, decrease our sadness, and without them, everything feels incomplete—so, thank you, friends!',
  hindi:
    'नमस्ते! दोस्ती बहुत खास होती है क्योंकि अच्छे दोस्त हमेशा हमारे साथ रहते हैं; वे हमारी खुशी बढ़ाते हैं, हमारा दुख कम करते हैं, और उनके बिना सब कुछ अधूरा लगता है—इसलिए, धन्यवाद दोस्तों!',
  tamil:
    'வணக்கம்! நட்பு மிகவும் சிறப்பானது, ஏனெனில் நல்ல நண்பர்கள் எப்போதும் நம் பக்கத்தில் இருப்பார்கள்; அவர்கள் நம் மகிழ்ச்சியை அதிகரிக்கிறார்கள், நம் சோகத்தைக் குறைக்கிறார்கள், அவர்கள் இல்லாமல் எல்லாமும் முழுமையற்றதாகத் தோன்றுகிறது—அதனால், நன்றி நண்பர்களே!',
  telugu:
    'నమస్కారం! స్నేహం చాలా ప్రత్యేకమైనది ఎందుకంటే మంచి స్నేహితులు ఎప్పుడూ మా పక్కన ఉంటారు; వారు మా ఆనందాన్ని పెంచుతారు, మా విచారాన్ని తగ్గిస్తారు, మరియు వారు లేకుండా, ప్రతిదీ అసంపూర్ణంగా అనిపిస్తుంది—కాబట్టి, ధన్యవాదాలు స్నేహితులారా!',
  kannada:
    'ನಮಸ್ಕಾರ! ಸ್ನೇಹವು ಬಹಳ ವಿಶೇಷವಾಗಿದೆ ಏಕೆಂದರೆ ಉತ್ತಮ ಸ್ನೇಹಿತರು ಯಾವಾಗಲೂ ನಮ್ಮ ಪಕ್ಕದಲ್ಲಿರುತ್ತಾರೆ; ಅವರು ನಮ್ಮ ಸಂತೋಷವನ್ನು ಹೆಚ್ಚಿಸುತ್ತಾರೆ, ನಮ್ಮ ದುಃಖವನ್ನು ಕಡಿಮೆ ಮಾಡುತ್ತಾರೆ, ಮತ್ತು ಅವರಿಲ್ಲದೆ, ಎಲ್ಲವೂ ಅಪೂರ್ಣವಾಗಿ ಭಾಸವಾಗುತ್ತದೆ—ಆದ್ದರಿಂದ, ಧನ್ಯವಾದಗಳು ಸ್ನೇಹಿತರೇ!',
};

const AUDIO_VERIFICATION_LANGUAGES = ['english', 'hindi', 'tamil', 'telugu', 'kannada'] as const;

const LANGUAGE_TAB_LABELS: Record<(typeof AUDIO_VERIFICATION_LANGUAGES)[number], string> = {
  english: 'English',
  hindi: 'हिन्दी',
  tamil: 'தமிழ்',
  telugu: 'తెలుగు',
  kannada: 'ಕನ್ನಡ',
};

type Language = (typeof AUDIO_VERIFICATION_LANGUAGES)[number];

function voiceVerificationFailureMessage(
  apiMessage?: string,
  result?: VoiceVerificationResult
): string {
  if (apiMessage?.trim()) return apiMessage.trim();
  if (!result) {
    return 'Your voice sample could not be verified. Please record again in a clear, natural voice.';
  }
  if (result.failureKind === 'gender_mismatch') {
    return `Voice sounds like ${result.predictedGender}, but your profile gender is ${result.profileGender ?? 'unknown'}. Please record again or update your profile gender if it is wrong.`;
  }
  if (result.failureKind === 'low_confidence') {
    return `Voice check was unclear (${Math.round(result.confidence * 100)}% confidence, need ${Math.round(result.threshold * 100)}%). Record again in a quiet place, speaking clearly for 8–12 seconds.`;
  }
  if (result.failureKind === 'misconfigured') {
    return 'Voice verification is not configured on the server (HF_API_TOKEN missing).';
  }
  if (result.failureKind === 'service_unavailable') {
    return result.reason || 'Voice verification service is unavailable. This is not a gender mismatch — the AI provider failed.';
  }
  if (result.reason?.includes('HF_API_TOKEN')) {
    return 'Voice verification is temporarily unavailable. Please try again later or contact support.';
  }
  return result.reason || 'Voice verification failed. Please try again.';
}

export default function ReceiverAutoVerificationScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const { applyServerUser } = useAuth();
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('english');
  const [userAudio, setUserAudio] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadDebugLog, setUploadDebugLog] = useState<CloudinaryUploadDebugEntry[]>([]);
  const [lastUploadError, setLastUploadError] = useState<string | null>(null);
  const [lastVerification, setLastVerification] = useState<VoiceVerificationResult | null>(null);

  const appendUploadDebug = useCallback((entry: CloudinaryUploadDebugEntry) => {
    setUploadDebugLog((prev) => [...prev.slice(-24), entry]);
  }, []);

  const onUploadComplete = useCallback((url: string) => {
    setUserAudio(url);
    setLastUploadError(null);
  }, []);

  const onProceed = async (): Promise<void> => {
    if (!userAudio) {
      Alert.alert('Recording required', 'Please record and upload your voice sample first.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await profileApi.completeReceiverAudioOnboarding({ userAudio });
      applyServerUser(data.user);
      setLastVerification(data.voiceVerification ?? null);
      navigation.replace('ReceiverMainTabs', { screen: 'ReceiverHome' });
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.status === 422) {
        const body = e.response.data as {
          message?: string;
          voiceVerification?: VoiceVerificationResult;
        };
        setLastVerification(body.voiceVerification ?? null);
        setUserAudio(null);
        Alert.alert(
          'Verification failed',
          voiceVerificationFailureMessage(body.message, body.voiceVerification)
        );
      } else {
        Alert.alert('Could not continue', getErrorMessage(e));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const currentScriptText = SCRIPT_TRANSLATIONS[selectedLanguage];
  const canContinue = Boolean(userAudio) && !submitting;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <OnboardingLogoutButton floating={false} style={styles.logoutBtn} />
      <View style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={24} color="#111827" />
        </TouchableOpacity>

        <View style={styles.line} />

        <Text style={styles.title}>Audio verification</Text>
        <Text style={styles.subTitle}>
          Read the paragraph in your clear voice. We verify it matches the gender on your profile when
          you continue.
        </Text>

        <View style={styles.languageTabsContainer}>
          {AUDIO_VERIFICATION_LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang}
              style={[styles.languageTab, selectedLanguage === lang && styles.languageTabActive]}
              onPress={() => setSelectedLanguage(lang)}
            >
              <Text
                style={[
                  styles.languageTabText,
                  selectedLanguage === lang && styles.languageTabTextActive,
                ]}
              >
                {LANGUAGE_TAB_LABELS[lang]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.scriptCard}>
            <Text style={styles.scriptText}>{currentScriptText}</Text>
          </View>

          <VoiceVerificationRecorder
            scriptText={currentScriptText}
            hideScript
            onUploadComplete={onUploadComplete}
            onUploadDebug={appendUploadDebug}
            onUploadError={setLastUploadError}
          />

          {/* <VoiceUploadDebugPanel
            entries={uploadDebugLog}
            lastError={lastUploadError}
            verification={lastVerification}
          /> */}

          {userAudio ? (
            <View style={styles.uploadedBadge}>
              <Icon name="check-circle" size={18} color="#059669" />
              <Text style={styles.uploadedText}>
                Voice uploaded — tap Continue to verify and open the dashboard
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => void onProceed()}
          style={[styles.proceedWrap, !canContinue && styles.proceedDisabled]}
          disabled={!canContinue}
        >
          <LinearGradient
            colors={canContinue ? ['#7F00FF', '#A855F7', '#E100FF'] : ['#D1D5DB', '#9CA3AF', '#D1D5DB']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.proceedBtn}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.proceedText}>Continue to dashboard</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  logoutBtn: { alignSelf: 'flex-end', marginRight: 22, marginBottom: 4 },
  container: { flex: 1, paddingHorizontal: 22, paddingTop: 10 },
  backBtn: { width: 34, height: 34, justifyContent: 'center', alignItems: 'center' },
  line: {
    width: '100%',
    height: 1,
    backgroundColor: '#ececec',
    marginTop: 12,
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '900', color: '#111827' },
  subTitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 6,
    marginBottom: 12,
    lineHeight: 18,
  },
  languageTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  languageTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  languageTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  languageTabText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  languageTabTextActive: { color: '#7F00FF' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  scriptCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '100%',
  },
  scriptText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#374151',
    textAlign: 'center',
  },
  uploadedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  uploadedText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#047857' },
  proceedWrap: { width: '100%', marginBottom: 20 },
  proceedDisabled: { opacity: 0.6 },
  proceedBtn: { borderRadius: 16, paddingVertical: 17, alignItems: 'center' },
  proceedText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
