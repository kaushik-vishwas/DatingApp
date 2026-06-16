import React from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';

type Props = {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  confirm?: boolean;
  confirmTitle?: string;
  confirmMessage?: string;
  /** When false, renders inline (e.g. in a header row) instead of absolute top-right. */
  floating?: boolean;
};

export default function OnboardingLogoutButton({
  onPress,
  style,
  confirm = true,
  confirmTitle = 'Logout',
  confirmMessage = 'Sign out and use another account?',
  floating = true,
}: Props): React.JSX.Element {
  const { signOut } = useAuth();

  const handlePress = (): void => {
    const run = onPress ?? (() => void signOut());
    if (!confirm) {
      run();
      return;
    }
    Alert.alert(confirmTitle, confirmMessage, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: run },
    ]);
  };

  return (
    <TouchableOpacity
      style={[floating ? styles.floating : styles.inline, style]}
      onPress={handlePress}
      hitSlop={12}
      activeOpacity={0.7}
    >
      <Text style={styles.text}>Logout</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  floating: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 100,
    paddingTop: 8,
    paddingRight: 16,
  },
  inline: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  text: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '700',
  },
});
