/**
 * One-shot: push "please update Selecto from Play Store" to all callers + receivers
 * that have an Expo push token.
 *
 * Uses Expo Push only — does not call FCM / incoming-call wake code.
 *
 *   npx tsx scripts/sendAppUpdateBroadcast.ts
 */
import '../config/bootstrapEnv';
import connectDB from '../config/database';
import User from '../models/User';
import Receiver from '../models/Receiver';
import { sendExpoBroadcastPush } from '../services/expoBroadcastPush';

const TITLE = 'Urgent: Update Selecto';
const BODY =
  'A critical update is available on Play Store. Please open Play Store → Selecto → Update now for proper payments and calls.';

async function main(): Promise<void> {
  await connectDB();

  const [callerRows, receiverRows] = await Promise.all([
    User.find({ expoPushToken: { $type: 'string', $ne: '' } })
      .select('expoPushToken')
      .lean<{ expoPushToken?: string | null }[]>(),
    Receiver.find({ expoPushToken: { $type: 'string', $ne: '' } })
      .select('expoPushToken')
      .lean<{ expoPushToken?: string | null }[]>(),
  ]);

  const callerTokens = callerRows.map((r) => String(r.expoPushToken ?? ''));
  const receiverTokens = receiverRows.map((r) => String(r.expoPushToken ?? ''));

  console.log(`Callers with Expo token: ${callerTokens.filter((t) => t.startsWith('ExponentPushToken')).length}`);
  console.log(
    `Receivers with Expo token: ${receiverTokens.filter((t) => t.startsWith('ExponentPushToken')).length}`
  );

  const callerResult = await sendExpoBroadcastPush(callerTokens, {
    title: TITLE,
    body: BODY,
    data: { audience: 'caller' },
  });
  console.log('Caller broadcast:', callerResult);

  const receiverResult = await sendExpoBroadcastPush(receiverTokens, {
    title: TITLE,
    body: BODY,
    data: { audience: 'receiver' },
  });
  console.log('Receiver broadcast:', receiverResult);

  console.log('Done. FCM incoming-call path was not used.');
  process.exit(0);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
