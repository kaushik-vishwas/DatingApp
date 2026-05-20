import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  loading?: boolean;
  footerExtra?: React.ReactNode;
};

export default function ReceiverOnboardingStepLayout({
  title,
  subtitle,
  children,
  onBack,
  onContinue,
  continueLabel = 'Continue',
  continueDisabled = false,
  loading = false,
  footerExtra,
}: Props): React.JSX.Element {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {onBack ? (
            <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
              <Icon name="chevron-left" size={26} color="#1a1a1a" />
            </TouchableOpacity>
          ) : (
            <View style={styles.backPlaceholder} />
          )}

          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <View style={styles.body}>{children}</View>
        </ScrollView>

        <View style={styles.footer}>
          {footerExtra}
          <TouchableOpacity
            style={[styles.ctaWrap, (continueDisabled || loading) && styles.ctaDisabled]}
            onPress={onContinue}
            disabled={continueDisabled || loading}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#7F00FF', '#A855F7', '#E100FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.cta}
            >
              <Text style={styles.ctaText}>{loading ? 'Please wait…' : continueLabel}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: 22,
    paddingBottom: 24,
    flexGrow: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#FFF',
    marginBottom: 16,
  },
  backPlaceholder: { height: 40, marginBottom: 16 },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 20,
  },
  body: { flex: 1 },
  footer: {
    paddingHorizontal: 22,
    paddingBottom: 16,
    paddingTop: 8,
    backgroundColor: '#F8F9FA',
  },
  ctaWrap: { borderRadius: 12, overflow: 'hidden' },
  ctaDisabled: { opacity: 0.55 },
  cta: { paddingVertical: 15, alignItems: 'center' },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
