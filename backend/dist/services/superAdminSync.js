"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfiguredAdminEmail = getConfiguredAdminEmail;
exports.syncSuperAdminFromEnv = syncSuperAdminFromEnv;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const Admin_1 = __importDefault(require("../models/Admin"));
/** Normalized admin email from env, or null if unset. */
function getConfiguredAdminEmail() {
    const raw = process.env.ADMIN_EMAIL?.trim() || '';
    return raw.toLowerCase();
}
/**
 * Ensures exactly one admin exists: the email from ADMIN_EMAIL.
 * Removes any other admin documents. New admin gets ADMIN_PASSWORD (or Admin@123 default).
 */
async function syncSuperAdminFromEnv() {
    const email = getConfiguredAdminEmail();
    if (!email) {
        console.warn('[admin] ADMIN_EMAIL is not set — super admin sync skipped. Set ADMIN_EMAIL in the backend .env.');
        return;
    }
    const name = String(process.env.ADMIN_NAME ?? 'Super Admin').trim() || 'Super Admin';
    await Admin_1.default.deleteMany({ email: { $ne: email } });
    const existing = await Admin_1.default.findOne({ email });
    if (existing) {
        existing.name = name;
        if (!existing.role) {
            existing.role = 'super_admin';
        }
        await existing.save();
        console.log(`[admin] Super admin synced: ${email}`);
        return;
    }
    const defaultPassword = String(process.env.ADMIN_PASSWORD ?? 'Admin@123');
    const passwordHash = await bcryptjs_1.default.hash(defaultPassword, 10);
    await Admin_1.default.create({
        email,
        passwordHash,
        name,
        role: 'super_admin',
    });
    console.log(`[admin] Created super admin for ${email}. Default password is set (change it after login).`);
}
