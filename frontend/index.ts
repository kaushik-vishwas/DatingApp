import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { registerIncomingCallBackgroundNotificationTask } from './tasks/incomingCallBackgroundNotificationTask';
import App from './App';

registerIncomingCallBackgroundNotificationTask();

registerRootComponent(App);

