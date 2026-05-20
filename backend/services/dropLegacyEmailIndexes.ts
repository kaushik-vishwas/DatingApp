import mongoose from 'mongoose';

const COLLECTIONS = ['users', 'receivers'] as const;

function isIndexMissingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: number }).code;
  return (
    code === 27 ||
    code === 26 ||
    /index not found/i.test(msg) ||
    /ns not found/i.test(msg)
  );
}

/**
 * Removes legacy unique `email_1` indexes left after phone-only auth.
 * Without this, MongoDB rejects a second receiver with implicit email: null (E11000).
 */
export async function dropLegacyEmailIndexes(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;

  for (const collName of COLLECTIONS) {
    const coll = db.collection(collName);
    try {
      await coll.dropIndex('email_1');
      console.log(`[migrate] Dropped index email_1 on ${collName}`);
    } catch (err) {
      if (!isIndexMissingError(err)) {
        console.warn(`[migrate] Could not drop email_1 on ${collName}:`, err);
      }
    }

    const unset = await coll.updateMany({ email: { $exists: true } }, { $unset: { email: '' } });
    if (unset.modifiedCount > 0) {
      console.log(`[migrate] Removed email field from ${unset.modifiedCount} ${collName} document(s)`);
    }
  }
}
