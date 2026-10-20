import React, { useEffect, useState } from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';

const DOT_STEP_MS = 500;
const POOR_NETWORK_AFTER_MS = 6000;

type Props = {
  sinceMs: number;
  style?: StyleProp<TextStyle>;
};

export default function ConnectingStatusText({ sinceMs, style }: Props): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), DOT_STEP_MS);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, now - sinceMs);
  const dotCount = (Math.floor(elapsed / DOT_STEP_MS) % 3) + 1;
  const label =
    elapsed >= POOR_NETWORK_AFTER_MS ? 'Poor network, connecting shortly' : 'Connecting';

  return (
    <Text style={style}>
      {label}
      {'.'.repeat(dotCount)}
      {/* Invisible padding dots keep the pill width steady while dots animate. */}
      <Text style={{ color: 'transparent' }}>{'.'.repeat(3 - dotCount)}</Text>
    </Text>
  );
}
