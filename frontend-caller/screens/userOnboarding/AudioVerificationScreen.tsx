// This screen is no longer used in the caller app (audio verification is receiver-only).
// Keeping the file in the repo is harmless, but we avoid typing it against a removed route.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const PURPLE = '#7b2cff';

export default function AudioVerificationScreen(): React.JSX.Element {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Audio verification</Text>
      <Text style={styles.subtitle}>This step is not required for callers.</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Disabled</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  badge: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: PURPLE,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  badgeText: { color: '#fff', fontWeight: '800' },
});
