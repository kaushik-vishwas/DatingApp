import mongoose from 'mongoose';
import CallSession from '../models/CallSession';
import ChatMessage from '../models/ChatMessage';
import { RESOLVED_RECEIVER_CALL_EARNING_EXPR, roundInr } from '../utils/receiverCallEarnings';

/** Same resolved payout as receiver wallet summary. */
const RESOLVED_RECEIVER_PAYOUT_EXPR = RESOLVED_RECEIVER_CALL_EARNING_EXPR;

export type ReceiverEarningsRollup = {
  callPayout: number;
  chatPayout: number;
  earnings: number;
  calls: number;
};

export type ReceiverEarningsPeriodRollup = {
  lifetime: ReceiverEarningsRollup;
  today: ReceiverEarningsRollup;
  last7Days: ReceiverEarningsRollup;
  last30Days: ReceiverEarningsRollup;
};

function emptyRollup(): ReceiverEarningsRollup {
  return { callPayout: 0, chatPayout: 0, earnings: 0, calls: 0 };
}

function mergeRollup(
  call: { payout: number; calls: number },
  chat: { payout: number; messages: number }
): ReceiverEarningsRollup {
  const callPayout = roundInr(call.payout);
  const chatPayout = roundInr(chat.payout);
  return {
    callPayout,
    chatPayout,
    earnings: roundInr(callPayout + chatPayout),
    calls: call.calls,
  };
}

type CallAggRow = {
  _id: mongoose.Types.ObjectId;
  totalPayout: number;
  todayPayout: number;
  weekPayout: number;
  monthPayout: number;
  totalCalls: number;
  callsToday: number;
  callsWeek: number;
  callsMonth: number;
};

type ChatAggRow = {
  _id: mongoose.Types.ObjectId;
  totalPayout: number;
  todayPayout: number;
  weekPayout: number;
  monthPayout: number;
  totalMessages: number;
  messagesToday: number;
  messagesWeek: number;
  messagesMonth: number;
};

/**
 * Per-receiver call + chat earnings using the same rules as GET /admin/overview receiver share.
 */
export async function aggregateReceiverEarningsByReceiver(
  receiverIds: mongoose.Types.ObjectId[],
  todayStart: Date,
  weekStart: Date,
  monthStart: Date
): Promise<Map<string, ReceiverEarningsPeriodRollup>> {
  const out = new Map<string, ReceiverEarningsPeriodRollup>();
  if (receiverIds.length === 0) return out;

  const [callRows, chatRows] = await Promise.all([
    CallSession.aggregate<CallAggRow>([
      {
        $match: {
          receiverId: { $in: receiverIds },
          status: 'completed',
          durationSec: { $gt: 0 },
        },
      },
      {
        $addFields: {
          resolvedReceiverPayout: RESOLVED_RECEIVER_PAYOUT_EXPR,
        },
      },
      {
        $group: {
          _id: '$receiverId',
          totalPayout: { $sum: '$resolvedReceiverPayout' },
          todayPayout: {
            $sum: {
              $cond: [{ $gte: ['$startedAt', todayStart] }, '$resolvedReceiverPayout', 0],
            },
          },
          weekPayout: {
            $sum: {
              $cond: [{ $gte: ['$startedAt', weekStart] }, '$resolvedReceiverPayout', 0],
            },
          },
          monthPayout: {
            $sum: {
              $cond: [{ $gte: ['$startedAt', monthStart] }, '$resolvedReceiverPayout', 0],
            },
          },
          totalCalls: { $sum: 1 },
          callsToday: {
            $sum: { $cond: [{ $gte: ['$startedAt', todayStart] }, 1, 0] },
          },
          callsWeek: {
            $sum: { $cond: [{ $gte: ['$startedAt', weekStart] }, 1, 0] },
          },
          callsMonth: {
            $sum: { $cond: [{ $gte: ['$startedAt', monthStart] }, 1, 0] },
          },
        },
      },
    ]),
    ChatMessage.aggregate<ChatAggRow>([
      {
        $match: {
          receiverId: { $in: receiverIds },
          senderType: 'u',
          feeInr: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: '$receiverId',
          totalPayout: { $sum: '$feeInr' },
          todayPayout: {
            $sum: {
              $cond: [{ $gte: ['$createdAt', todayStart] }, '$feeInr', 0],
            },
          },
          weekPayout: {
            $sum: {
              $cond: [{ $gte: ['$createdAt', weekStart] }, '$feeInr', 0],
            },
          },
          monthPayout: {
            $sum: {
              $cond: [{ $gte: ['$createdAt', monthStart] }, '$feeInr', 0],
            },
          },
          totalMessages: { $sum: 1 },
          messagesToday: {
            $sum: { $cond: [{ $gte: ['$createdAt', todayStart] }, 1, 0] },
          },
          messagesWeek: {
            $sum: { $cond: [{ $gte: ['$createdAt', weekStart] }, 1, 0] },
          },
          messagesMonth: {
            $sum: { $cond: [{ $gte: ['$createdAt', monthStart] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  const callById = new Map(callRows.map((row) => [String(row._id), row]));
  const chatById = new Map(chatRows.map((row) => [String(row._id), row]));

  for (const id of receiverIds) {
    const key = String(id);
    const call = callById.get(key);
    const chat = chatById.get(key);
    out.set(key, {
      lifetime: mergeRollup(
        {
          payout: call?.totalPayout ?? 0,
          calls: call?.totalCalls ?? 0,
        },
        {
          payout: chat?.totalPayout ?? 0,
          messages: chat?.totalMessages ?? 0,
        }
      ),
      today: mergeRollup(
        {
          payout: call?.todayPayout ?? 0,
          calls: call?.callsToday ?? 0,
        },
        {
          payout: chat?.todayPayout ?? 0,
          messages: chat?.messagesToday ?? 0,
        }
      ),
      last7Days: mergeRollup(
        {
          payout: call?.weekPayout ?? 0,
          calls: call?.callsWeek ?? 0,
        },
        {
          payout: chat?.weekPayout ?? 0,
          messages: chat?.messagesWeek ?? 0,
        }
      ),
      last30Days: mergeRollup(
        {
          payout: call?.monthPayout ?? 0,
          calls: call?.callsMonth ?? 0,
        },
        {
          payout: chat?.monthPayout ?? 0,
          messages: chat?.messagesMonth ?? 0,
        }
      ),
    });
  }

  return out;
}

export function sumReceiverEarningsRollup(
  rollups: Iterable<ReceiverEarningsPeriodRollup>,
  period: keyof ReceiverEarningsPeriodRollup
): ReceiverEarningsRollup {
  let callPayout = 0;
  let chatPayout = 0;
  let calls = 0;
  for (const row of rollups) {
    const bucket = row[period];
    callPayout += bucket.callPayout;
    chatPayout += bucket.chatPayout;
    calls += bucket.calls;
  }
  return mergeRollup({ payout: callPayout, calls }, { payout: chatPayout, messages: 0 });
}
