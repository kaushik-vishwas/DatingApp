import type { NavigatorScreenParams } from '@react-navigation/native';
import type { ReceiverTabParamList } from './ReceiverTabParamList';

/** Navigate to the receiver home tab inside bottom tabs. */
export const RECEIVER_MAIN_TABS_HOME: {
  screen: 'ReceiverMainTabs';
  params: NavigatorScreenParams<ReceiverTabParamList>;
} = {
  screen: 'ReceiverMainTabs',
  params: { screen: 'ReceiverHome' },
};
