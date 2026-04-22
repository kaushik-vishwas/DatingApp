/**
 * One-time: align legacy caller rows with suspended-only access after profile submit.
 * - pending_review + not suspended → approved + suspended (awaiting admin enable)
 * - rejected + not suspended → approved + suspended
 *
 * Run: npx tsx scripts/migrateCallerAccessSuspendedOnly.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';

dotenv.config();

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const r1 = await User.updateMany(
    { accountStatus: 'pending_review', suspended: false },
    { $set: { accountStatus: 'approved', suspended: true } }
  );
  const r2 = await User.updateMany(
    { accountStatus: 'rejected', suspended: false },
    { $set: { accountStatus: 'approved', suspended: true } }
  );
  console.log('pending_review → approved+suspended:', r1.modifiedCount);
  console.log('rejected → approved+suspended:', r2.modifiedCount);
  await mongoose.disconnect();
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
