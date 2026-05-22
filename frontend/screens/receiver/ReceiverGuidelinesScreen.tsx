// src/screens/receiver/ReceiverGuidelinesScreen.tsx

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Dimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';

import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverGuidelines'>;

const { width, height } = Dimensions.get('window');
const isTablet = width >= 768;
const isSmallDevice = width <= 375;

export default function ReceiverGuidelinesScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView 
        style={styles.screen} 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()} 
            style={styles.backBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="chevron-left" size={isSmallDevice ? 22 : 24} color="#1a1a1a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Selecto Guidelines</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Strictly Not Allowed Card */}
        <View style={[styles.card, styles.notAllowedCard]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconContainer, styles.dangerIconContainer]}>
              <Icon name="slash" size={isTablet ? 28 : 24} color="#dc2626" />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, styles.dangerText]}>Strictly Not Allowed</Text>
              <Text style={styles.cardSubtitle}>Violations will result in immediate action</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.ruleList}>
            <View style={styles.ruleItem}>
              <Icon name="phone-off" size={isSmallDevice ? 14 : 16} color="#dc2626" />
              <Text style={styles.ruleText}>Silence on calls</Text>
            </View>
            <View style={styles.ruleItem}>
              <Icon name="user-x" size={isSmallDevice ? 14 : 16} color="#dc2626" />
              <Text style={styles.ruleText}>Fake online or inactive</Text>
            </View>
            <View style={styles.ruleItem}>
              <Icon name="alert-octagon" size={isSmallDevice ? 14 : 16} color="#dc2626" />
              <Text style={styles.ruleText}>Sexual or abusive talk</Text>
            </View>
            <View style={styles.ruleItem}>
              <Icon name="lock" size={isSmallDevice ? 14 : 16} color="#dc2626" />
              <Text style={styles.ruleText}>Sharing personal information (Phone, Insta, OTP.)</Text>
            </View>
            <View style={styles.ruleItem}>
              <Icon name="dollar-sign" size={isSmallDevice ? 14 : 16} color="#dc2626" />
              <Text style={styles.ruleText}>Ask for extra money</Text>
            </View>
            <View style={styles.ruleItem}>
              <Icon name="user-check" size={isSmallDevice ? 14 : 16} color="#dc2626" />
              <Text style={styles.ruleText}>Fake IDs or wrong gender</Text>
            </View>
            <View style={styles.ruleItem}>
              <Icon name="thumbs-down" size={isSmallDevice ? 14 : 16} color="#dc2626" />
              <Text style={styles.ruleText}>Disrespectful or rude behavior</Text>
            </View>
            <View style={styles.ruleItem}>
              <Icon name="volume-2" size={isSmallDevice ? 14 : 16} color="#dc2626" />
              <Text style={styles.ruleText}>Background voice and busy</Text>
            </View>
          </View>
        </View>

        {/* Allowed When Online Card */}
        <View style={[styles.card, styles.allowedCard]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconContainer, styles.successIconContainer]}>
              <Icon name="wifi" size={isTablet ? 28 : 24} color="#10b981" />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, styles.successText]}>Allowed When Online</Text>
              <Text style={styles.cardSubtitle}>Best practices for a great experience</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.ruleList}>
            <View style={styles.ruleItem}>
              <Icon name="clock" size={isSmallDevice ? 14 : 16} color="#10b981" />
              <Text style={styles.ruleText}>Start talking within 3 seconds</Text>
            </View>
            <View style={styles.ruleItem}>
              <Icon name="heart" size={isSmallDevice ? 14 : 16} color="#10b981" />
              <Text style={styles.ruleText}>Talk politely and with respect</Text>
            </View>
            <View style={styles.ruleItem}>
              <Icon name="shield" size={isSmallDevice ? 14 : 16} color="#10b981" />
              <Text style={styles.ruleText}>Blocking bad behaviour users</Text>
            </View>
          </View>
        </View>

        {/* Warning Banner */}
        <View style={styles.warningBanner}>
          <Icon name="alert-triangle" size={isSmallDevice ? 20 : 22} color="#f59e0b" />
          <Text style={styles.warningText}>
            Any violation will lead to an instant ban or block!
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { 
    flex: 1, 
    backgroundColor: '#f8f9fa',
  },
  screen: { 
    flex: 1, 
    backgroundColor: '#f8f9fa',
  },
  content: { 
    paddingHorizontal: '5%',
    paddingVertical: Platform.OS === 'ios' ? 20 : 16,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
  },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: width * 0.06,
    marginTop: Platform.OS === 'ios' ? 0 : 8,
  },
  backBtn: {
    width: isTablet ? 44 : 40,
    height: isTablet ? 44 : 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: isTablet ? 22 : 20,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  placeholder: { 
    width: isTablet ? 44 : 40,
  },
  headerTitle: { 
    fontSize: isTablet ? 24 : (isSmallDevice ? 18 : 20),
    fontWeight: '800', 
    color: '#1a1a1a',
    letterSpacing: -0.3,
  },
  
  card: {
    borderRadius: isTablet ? 28 : 24,
    padding: isTablet ? '5%' : (isSmallDevice ? 16 : 20),
    marginBottom: width * 0.05,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    backgroundColor: '#fff',
  },
  notAllowedCard: {
    borderLeftWidth: isTablet ? 5 : 4,
    borderLeftColor: '#dc2626',
  },
  allowedCard: {
    borderLeftWidth: isTablet ? 5 : 4,
    borderLeftColor: '#10b981',
  },
  
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: isSmallDevice ? 12 : 16,
  },
  iconContainer: {
    width: isTablet ? 56 : (isSmallDevice ? 44 : 48),
    height: isTablet ? 56 : (isSmallDevice ? 44 : 48),
    borderRadius: isTablet ? 28 : (isSmallDevice ? 22 : 24),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: isSmallDevice ? 12 : 16,
  },
  dangerIconContainer: {
    backgroundColor: '#fee2e2',
  },
  successIconContainer: {
    backgroundColor: '#d1fae5',
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: isTablet ? 22 : (isSmallDevice ? 16 : 18),
    fontWeight: '800',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: isTablet ? 13 : (isSmallDevice ? 10 : 12),
    color: '#6b7280',
    fontWeight: '500',
  },
  dangerText: { color: '#dc2626' },
  successText: { color: '#10b981' },
  
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginBottom: isSmallDevice ? 14 : 16,
  },
  
  ruleList: {
    gap: isSmallDevice ? 12 : 14,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isSmallDevice ? 10 : 12,
    flexWrap: 'wrap',
  },
  ruleText: {
    flex: 1,
    fontSize: isTablet ? 16 : (isSmallDevice ? 12 : 14),
    color: '#374151',
    lineHeight: isTablet ? 24 : (isSmallDevice ? 18 : 20),
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    padding: isTablet ? 20 : (isSmallDevice ? 14 : 16),
    borderRadius: isTablet ? 20 : 16,
    gap: isSmallDevice ? 10 : 12,
    marginTop: width * 0.02,
    borderWidth: 1,
    borderColor: '#fde68a',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  warningText: {
    flex: 1,
    fontSize: isTablet ? 15 : (isSmallDevice ? 11 : 13),
    fontWeight: '700',
    color: '#92400e',
    lineHeight: isTablet ? 22 : (isSmallDevice ? 16 : 18),
    letterSpacing: -0.2,
    flexWrap: 'wrap',
  },
});