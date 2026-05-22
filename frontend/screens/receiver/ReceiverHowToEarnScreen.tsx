import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';

import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverHowToEarn'>;

type EarnStep = {
  title: string;
  subtitle: string;
  bullets: string[];
  icon: string;
};

const EARN_STEPS: EarnStep[] = [
  {
    title: 'How You Earn',
    subtitle: 'Your earnings depend on call duration & timing',
    icon: '💰',
    bullets: [
      'Calls under 1 minute = 0 earnings ❌',
      'Calls 3-10 minutes = 3x score multiplier',
      'Calls above 10 minutes = 5x score multiplier',
      'Longer calls = much higher earnings!',
    ],
  },
  {
    title: 'Best Time to Earn',
    subtitle: 'Extra bonuses during night hours',
    icon: '⏰',
    bullets: [
      'Day time (9 AM - 9 PM): 0.5x multiplier',
      'Night (10 PM - 12 AM): 3x multiplier 🎉',
      'Late night (12 AM - 2 AM): 10x multiplier 🔥',
      'Best earning: Take calls after 10 PM!',
    ],
  },
  {
    title: 'Badge Levels',
    subtitle: 'Higher badge = higher pay per minute',
    icon: '🏆',
    bullets: [
      'Bronze (1+ score): ₹1.3/min',
      'Silver (1648+ score): ₹1.5/min',
      'Gold (10403+ score): ₹1.7/min',
      'Pro (16686+ score): ₹1.9/min',
      'Platinum (below 8000): ₹2.0/min',
      'Diamond (8000-12000): ₹2.3/min',
      'Supreme (12000+): ₹2.6/min 👑',
    ],
  },
  {
    title: 'Phone Etiquette',
    subtitle: 'Best practices for great conversations',
    icon: '💬',
    bullets: [
      'Stay respectful and professional.',
      'Listen actively to customer needs.',
      'Keep conversations appropriate.',
      'Never share personal contact info.',
      'Report inappropriate behavior.',
      'Respond quickly to incoming calls.',
      'Build relationships for repeat customers.',
    ],
  },
  {
    title: 'Pro Tips',
    subtitle: 'Maximize your daily earnings',
    icon: '⭐',
    bullets: [
      'Talk for 10+ minutes to get 5x points',
      'Be active after 10 PM for bonus multipliers',
      'Avoid calls shorter than 1 minute',
      'Higher score = better badge = more ₹ per minute',
      'Consistent earnings = reach Supreme level!',
    ],
  },
];

export default function ReceiverHowToEarnScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const [currentStep, setCurrentStep] = useState(0);
  const [fadeAnim] = useState(new Animated.Value(1));

  const handleNext = () => {
    if (currentStep < EARN_STEPS.length - 1) {
      // Fade out animation
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setCurrentStep(currentStep + 1);
        // Fade in animation
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    } else {
      // Navigate to next screen when done
      navigation.goBack();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      // Fade out animation
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setCurrentStep(currentStep - 1);
        // Fade in animation
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    }
  };

  const step = EARN_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === EARN_STEPS.length - 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="chevron-left" size={24} color="#1a1a1a" />
          </TouchableOpacity>
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              {currentStep + 1} of {EARN_STEPS.length}
            </Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${((currentStep + 1) / EARN_STEPS.length) * 100}%` }
                ]} 
              />
            </View>
          </View>
          <View style={styles.placeholder} />
        </View>

        {/* Content */}
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
            {/* Icon */}
            <Text style={styles.icon}>{step.icon}</Text>
            
            {/* Title */}
            <Text style={styles.title}>{step.title}</Text>
            
            {/* Subtitle */}
            <Text style={styles.subtitle}>{step.subtitle}</Text>
            
            {/* Divider */}
            <View style={styles.divider} />
            
            {/* Bullets */}
            <View style={styles.bulletsContainer}>
              {step.bullets.map((bullet, index) => (
                <View key={index} style={styles.bulletRow}>
                  <View style={styles.bulletDot}>
                    <Text style={styles.bulletNumber}>{index + 1}</Text>
                  </View>
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        </ScrollView>

        {/* Navigation Buttons */}
        <View style={styles.footer}>
          {!isFirstStep && (
            <TouchableOpacity
              style={styles.prevButton}
              onPress={handlePrevious}
              activeOpacity={0.7}
            >
              <Text style={styles.prevButtonText}>Previous</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={[styles.nextButton, isFirstStep && styles.nextButtonFull]}
            onPress={handleNext}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={['#7F00FF', '#A855F7', '#E100FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gradient}
            >
              <Text style={styles.nextButtonText}>
                {isLastStep ? 'Get Started' : 'Next'}
              </Text>
              {!isLastStep && <Icon name="arrow-right" size={20} color="#fff" />}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: '#F8F9FA',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  placeholder: {
    width: 40,
  },
  progressContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 16,
  },
  progressText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
    marginBottom: 6,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#A855F7',
    borderRadius: 2,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  icon: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginBottom: 24,
  },
  bulletsContainer: {
    gap: 16,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  bulletDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A855F7',
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    backgroundColor: '#F8F9FA',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  prevButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  prevButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  nextButton: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#7F00FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  nextButtonFull: {
    flex: 1,
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});