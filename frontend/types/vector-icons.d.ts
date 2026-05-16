declare module 'react-native-vector-icons/Ionicons' {
  import type { ComponentType } from 'react';
  import type { TextProps } from 'react-native';
  const Icon: ComponentType<TextProps & { name: string; size?: number; color?: string }>;
  export default Icon;
}

declare module 'react-native-vector-icons/Feather' {
  import type { ComponentType } from 'react';
  import type { TextProps } from 'react-native';
  const Icon: ComponentType<TextProps & { name: string; size?: number; color?: string }>;
  export default Icon;
}
