import React, { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReceiverTabBarBottomInset } from '../../utils/receiverTabBarInset';

/**
 * Optional flex wrapper; primary fix is scroll `contentContainerStyle` padding.
 * Uses marginBottom so flex children don't extend under the tab bar.
 */
export default function ReceiverTabBody({
  children,
  style,
  extraInset,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  extraInset?: number;
}): React.JSX.Element {
  const marginBottom = useReceiverTabBarBottomInset(extraInset);

  return <View style={[styles.body, { marginBottom }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  body: { flex: 1 },
});
