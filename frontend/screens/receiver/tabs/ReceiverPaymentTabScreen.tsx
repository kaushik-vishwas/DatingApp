import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReceiverPaymentTabsContent from '../../../components/receiver/ReceiverPaymentTabsContent';
import ReceiverTabBody from '../../../components/receiver/ReceiverTabBody';
import ReceiverTabScreenHeader from '../../../components/receiver/ReceiverTabScreenHeader';

export default function ReceiverPaymentTabScreen(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ReceiverTabScreenHeader title="Payment" subtitle="Earnings and withdrawals" backTarget="home" />
      <ReceiverTabBody>
        <ReceiverPaymentTabsContent />
      </ReceiverTabBody>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f8' },
});
