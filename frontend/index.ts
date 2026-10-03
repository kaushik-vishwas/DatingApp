import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { registerIncomingCallBackgroundNotificationTask } from './tasks/incomingCallBackgroundNotificationTask';
import App from './App';
import { wrapApp } from './utils/sentry';

registerIncomingCallBackgroundNotificationTask();

registerRootComponent(wrapApp(App));

