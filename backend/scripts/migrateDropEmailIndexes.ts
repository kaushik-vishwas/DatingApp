/**
 * One-time: drop legacy email_1 unique indexes on users/receivers (phone-only auth).
 *
 * Run: npx tsx scripts/migrateDropEmailIndexes.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { dropLegacyEmailIndexes } from '../services/dropLegacyEmailIndexes';

dotenv.config();

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }
  await mongoose.connect(uri);
  await dropLegacyEmailIndexes();
  await mongoose.disconnect();
  console.log('Done.');
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
