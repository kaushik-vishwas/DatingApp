import {
  createNavigationContainerRef,
  type NavigationContainerRef,
} from '@react-navigation/native';
import type { RootStackParamList } from './RootStackParamList';

/** React Navigation 7 root ref — use this object (not React.createRef). */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function getRootNavigation(): NavigationContainerRef<RootStackParamList> | null {
  try {
    if (navigationRef.isReady()) return navigationRef;
  } catch {
    // fall through to .current
  }
  try {
    const current = navigationRef.current;
    if (current && typeof current.isReady === 'function' && current.isReady()) {
      return current;
    }
  } catch {
    return null;
  }
  return null;
}
