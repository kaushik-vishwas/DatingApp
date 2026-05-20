import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CallerChatsList from '../../../components/caller/CallerChatsList';
import CallerTabScreenHeader from '../../../components/caller/CallerTabScreenHeader';
import ReceiverTabBody from '../../../components/receiver/ReceiverTabBody';
import { useReceiverTabBarBottomInset } from '../../../utils/receiverTabBarInset';

export default function CallerChatTabScreen(): React.JSX.Element {
  const listPaddingBottom = useReceiverTabBarBottomInset();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <CallerTabScreenHeader title="Chat" subtitle="All conversations" backTarget="home" />
      <ReceiverTabBody>
        <CallerChatsList listPaddingBottom={listPaddingBottom} />
      </ReceiverTabBody>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7' },
});
