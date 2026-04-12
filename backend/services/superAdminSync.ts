import bcrypt from 'bcryptjs';
import Admin from '../models/Admin';

/** Normalized admin email from env, or null if unset. */
export function getConfiguredAdminEmail(): string | null {
  const raw = process.env.ADMIN_EMAIL?.trim() || '';
  return raw.toLowerCase();
}

/**
 * Ensures exactly one admin exists: the email from ADMIN_EMAIL.
 * Removes any other admin documents. New admin gets ADMIN_PASSWORD (or Admin@123 default).
 */
export async function syncSuperAdminFromEnv(): Promise<void> {
  const email = getConfiguredAdminEmail();
  if (!email) {
    console.warn('[admin] ADMIN_EMAIL is not set — super admin sync skipped. Set ADMIN_EMAIL in the project root .env.');
    return;
  }

  const name = String(process.env.ADMIN_NAME ?? 'Super Admin').trim() || 'Super Admin';

  await Admin.deleteMany({ email: { $ne: email } });

  const existing = await Admin.findOne({ email });
  if (existing) {
    existing.name = name;
    await existing.save();
    console.log(`[admin] Super admin synced: ${email}`);
    return;
  }

  const defaultPassword = String(process.env.ADMIN_PASSWORD ?? 'Admin@123');
  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  await Admin.create({
    email,
    passwordHash,
    name,
    role: 'super_admin',
  });
  console.log(`[admin] Created super admin for ${email}. Default password is set (change it after login).`);
}
