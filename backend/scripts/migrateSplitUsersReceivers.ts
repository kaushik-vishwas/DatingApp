/**
 * One-time migration: legacy single `users` collection (with `role`) →
 * `users` (app members / callers only) + `receivers` (call receivers).
 *
 * Run from backend folder: npm run migrate:split-users
 * Requires MONGODB_URI. Stop the API server first.
 */
import '../config/bootstrapEnv';
import mongoose from 'mongoose';
import connectDB from '../config/database';

async function main(): Promise<void> {
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No database handle');
  }

  const names = (await db.listCollections().toArray()).map((c) => c.name);

  if (names.includes('users_legacy')) {
    console.error('Collection users_legacy already exists. Aborting to avoid double migration.');
    process.exit(1);
  }

  if (!names.includes('users')) {
    console.log('No users collection found — nothing to migrate.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const raw = db.collection('users');
  const sample = await raw.findOne({});
  if (!sample) {
    console.log('users collection is empty.');
    await mongoose.disconnect();
    process.exit(0);
  }

  if (!('role' in sample)) {
    console.log(
      'Documents have no role field — database may already use split collections. Aborting.'
    );
    await mongoose.disconnect();
    process.exit(0);
  }

  await raw.rename('users_legacy');
  console.log('Renamed collection users → users_legacy');

  const legacy = db.collection('users_legacy');
  const usersCol = db.collection('users');
  const receiversCol = db.collection('receivers');

  for await (const doc of legacy.find()) {
    const d = doc as Record<string, unknown>;
    const _id = d._id;
    const role = d.role as string;
    const base = {
      _id,
      name: String(d.name ?? '').trim(),
      email: String(d.email ?? '').toLowerCase().trim(),
      phone: String(d.phone ?? '').trim(),
      isVerified: Boolean(d.isVerified),
      otp: d.otp != null ? String(d.otp) : null,
      otpExpiry: d.otpExpiry instanceof Date ? d.otpExpiry : d.otpExpiry ? new Date(String(d.otpExpiry)) : null,
      accountStatus: (d.accountStatus as string) || 'pending_profile',
      profileImage: d.profileImage != null ? String(d.profileImage) : null,
      languages: Array.isArray(d.languages) ? d.languages.map(String) : [],
      interests: Array.isArray(d.interests) ? d.interests.map(String) : [],
      gender: d.gender != null ? d.gender : null,
      age: typeof d.age === 'number' ? d.age : d.age != null ? Number(d.age) : null,
      state: d.state != null ? String(d.state).trim() : null,
      passwordHash: d.passwordHash != null ? String(d.passwordHash) : null,
      suspended: false,
      walletBalance: 0,
      createdAt: d.createdAt instanceof Date ? d.createdAt : new Date(),
      updatedAt: d.updatedAt instanceof Date ? d.updatedAt : new Date(),
    };

    if (role === 'caller') {
      await usersCol.insertOne(base as never);
    } else {
      await receiversCol.insertOne({
        ...base,
        audioCallRate: null,
        documents: Array.isArray(d.documents) ? d.documents.map(String) : [],
        aadhaarFront: d.aadhaarFront != null ? String(d.aadhaarFront) : null,
        aadhaarBack: d.aadhaarBack != null ? String(d.aadhaarBack) : null,
        bankAccountHolderName: d.bankAccountHolderName != null ? String(d.bankAccountHolderName) : null,
        bankAccountType: d.bankAccountType === 'savings' || d.bankAccountType === 'current' ? d.bankAccountType : null,
        bankAccountNumber: d.bankAccountNumber != null ? String(d.bankAccountNumber) : null,
        bankIfsc: d.bankIfsc != null ? String(d.bankIfsc) : null,
        bankName: d.bankName != null ? String(d.bankName) : null,
      } as never);
    }
  }

  const { default: User } = await import('../models/User');
  const { default: Receiver } = await import('../models/Receiver');
  const nCallers = await User.countDocuments();
  const nReceivers = await Receiver.countDocuments();
  console.log(`Done. users: ${nCallers}, receivers: ${nReceivers}`);

  await User.syncIndexes();
  await Receiver.syncIndexes();
  console.log('Indexes synced.');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
