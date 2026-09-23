/**
 * Credit captured Razorpay payments that missed wallet top-up (idempotent).
 * Usage: npx tsx scripts/creditMissedRazorpayPayments.ts pay_xxx pay_yyy
 */
import '../config/bootstrapEnv';
import mongoose from 'mongoose';
import { creditRazorpayCapturedPayment } from '../controllers/walletController';

async function main(): Promise<void> {
  const ids = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    console.error('Usage: npx tsx scripts/creditMissedRazorpayPayments.ts <paymentId>...');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
    family: 4,
  });
  try {
    for (const id of ids) {
      const result = await creditRazorpayCapturedPayment(id);
      console.log(JSON.stringify(result));
    }
  } finally {
    await mongoose.disconnect();
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
