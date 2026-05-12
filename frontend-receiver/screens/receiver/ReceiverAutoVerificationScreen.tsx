import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverAutoVerification'>;

const RECEIVER_AUDIO_VERIFICATION_SCRIPT =
  'Hello! Friendship is very special because good friends are always by our side; ' +
  'they increase our happiness, decrease our sadness, and without them, ' +
  'everything feels incomplete—so, thank you, friends!';

export default function ReceiverAutoVerificationScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const { applyServerUser } = useAuth();
  const [savingToServer, setSavingToServer] = useState(false);
  const [canContinue, setCanContinue] = useState(false);

  const onUploadComplete = (url: string): void => {
    void (async () => {
      setSavingToServer(true);
      setCanContinue(false);
      try {
        const { data } = await profileApi.updateReceiverProfile({ userAudio: url });
        applyServerUser(data.user);
        if (data.user.accountStatus === 'approved' && Boolean(data.user.userAudio?.trim())) {
          setCanContinue(true);
        } else {
          Alert.alert(
            'Profile incomplete',
            'Finish your profile (name, photo, state, languages, interests) first, then record your voice again.'
          );
        }
      } catch (e) {
        Alert.alert('Could not save voice sample', getErrorMessage(e));
      } finally {
        setSavingToServer(false);
      }
    })();
  };

  const onProceed = (): void => {
    if (!canContinue) return;
    navigation.replace('ReceiverHome');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={24} color="#111827" />
        </TouchableOpacity>

        <View style={styles.line} />

        <Text style={styles.title}>Audio verification</Text>
        <Text style={styles.subTitle}>Record your voice by reading the paragraph below. It is uploaded securely.</Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <VoiceVerificationRecorder scriptText={RECEIVER_AUDIO_VERIFICATION_SCRIPT} onUploadComplete={onUploadComplete} />
        </ScrollView>

        <TouchableOpacity disabled={!canContinue} activeOpacity={0.9} onPress={onProceed} style={styles.proceedWrap}>
          <LinearGradient
            colors={canContinue ? ['#7F00FF', '#A855F7', '#E100FF'] : ['#d8d8dd', '#d8d8dd']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.proceedBtn}
          >
            <Text style={[styles.proceedText, !canContinue && styles.proceedTextDisabled]}>Continue to dashboard</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <Modal visible={savingToServer} transparent animationType="fade">
        <View style={styles.savingOverlay}>
          <ActivityIndicator size="large" color="#7F00FF" />
          <Text style={styles.savingText}>Saving verification…</Text>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  backBtn: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  line: {
    width: '100%',
    height: 1,
    backgroundColor: '#ececec',
    marginTop: 12,
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
  },
  subTitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 6,
    marginBottom: 12,
    lineHeight: 18,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  proceedWrap: {
    width: '100%',
    marginBottom: 20,
  },
  proceedBtn: {
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
  },
  proceedText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  proceedTextDisabled: {
    color: '#777',
  },
  savingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#374151',
    fontWeight: '600',
  },
});
