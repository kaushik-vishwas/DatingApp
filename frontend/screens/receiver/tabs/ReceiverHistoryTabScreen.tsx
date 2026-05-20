import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReceiverCallHistoryContent from '../../../components/receiver/ReceiverCallHistoryContent';
import ReceiverTabBody from '../../../components/receiver/ReceiverTabBody';
import ReceiverTabScreenHeader from '../../../components/receiver/ReceiverTabScreenHeader';
import { useReceiverTabBarBottomInset } from '../../../utils/receiverTabBarInset';

export default function ReceiverHistoryTabScreen(): React.JSX.Element {
  const scrollPaddingBottom = useReceiverTabBarBottomInset();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ReceiverTabScreenHeader title="History" subtitle="Your calls" backTarget="home" />
      <ReceiverTabBody>
        <ReceiverCallHistoryContent callsOnly scrollPaddingBottom={scrollPaddingBottom} />
      </ReceiverTabBody>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8f8f8' },
});
