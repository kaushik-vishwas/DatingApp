import '../config/bootstrapEnv';
import bcrypt from 'bcryptjs';
import connectDB from '../config/database';
import Admin from '../models/Admin';
import { getConfiguredAdminEmail, syncSuperAdminFromEnv } from '../services/superAdminSync';

async function main(): Promise<void> {
  await connectDB();
  await syncSuperAdminFromEnv();

  const email = getConfiguredAdminEmail();
  if (!email) {
    console.error('Set ADMIN_EMAIL in the project root .env, then run this script again.');
    process.exit(1);
    return;
  }

  const password = process.env.ADMIN_PASSWORD?.trim();
  if (password) {
    if (password.length < 8) {
      console.error('ADMIN_PASSWORD must be at least 8 characters.');
      process.exit(1);
      return;
    }
    const admin = await Admin.findOne({ email });
    if (admin) {
      admin.passwordHash = await bcrypt.hash(password, 10);
      await admin.save();
      console.log('Updated super admin password from ADMIN_PASSWORD for:', email);
    }
  } else {
    console.log('Super admin:', email, '(use admin panel reset flow to set password, or set ADMIN_PASSWORD for this script)');
  }

  process.exit(0);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
