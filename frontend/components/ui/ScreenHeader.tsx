import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';

type Props = {
  title: string;
  subtitle?: string;
  navigation: NavigationProp<ParamListBase>;
  /** Show back when stack can go back */
  showBack?: boolean;
};

export function ScreenHeader({ title, subtitle, navigation, showBack = true }: Props): React.JSX.Element {
  const canGoBack = navigation.canGoBack() && showBack;

  return (
    <View style={styles.row}>
      {canGoBack ? (
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.backPlaceholder} />
      )}
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.backPlaceholder} />
    </View>
  );
}

const PURPLE = '#7b2cff';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  backBtn: {
    minWidth: 72,
  },
  backPlaceholder: { minWidth: 72 },
  backText: {
    color: PURPLE,
    fontSize: 14,
    fontWeight: '700',
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
});
