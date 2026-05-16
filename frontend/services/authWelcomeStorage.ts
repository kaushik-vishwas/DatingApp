import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@nesthama_auth_welcome_seen';

export async function hasSeenAuthWelcome(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markAuthWelcomeSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {
    /* ignore */
  }
}
