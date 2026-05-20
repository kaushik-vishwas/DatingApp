import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CallerStackParamList } from '../navigation/CallerStackParamList';
import type { CallerTabParamList } from '../navigation/CallerTabParamList';

export type CallerAppNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<CallerTabParamList>,
  NativeStackNavigationProp<CallerStackParamList>
>;

export function useCallerAppNavigation(): CallerAppNavigationProp {
  return useNavigation<CallerAppNavigationProp>();
}
