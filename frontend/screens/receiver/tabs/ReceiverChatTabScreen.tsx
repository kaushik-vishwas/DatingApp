import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReceiverChatsList from '../../../components/receiver/ReceiverChatsList';
import ReceiverTabBody from '../../../components/receiver/ReceiverTabBody';
import ReceiverTabScreenHeader from '../../../components/receiver/ReceiverTabScreenHeader';
import { useReceiverTabBarBottomInset } from '../../../utils/receiverTabBarInset';

export default function ReceiverChatTabScreen(): React.JSX.Element {
  const listPaddingBottom = useReceiverTabBarBottomInset();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ReceiverTabScreenHeader title="Chat" subtitle="All conversations" backTarget="home" />
      <ReceiverTabBody>
        <ReceiverChatsList listPaddingBottom={listPaddingBottom} />
      </ReceiverTabBody>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7' },
});
