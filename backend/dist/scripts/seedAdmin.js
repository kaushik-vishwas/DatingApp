"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/bootstrapEnv");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = __importDefault(require("../config/database"));
const Admin_1 = __importDefault(require("../models/Admin"));
const superAdminSync_1 = require("../services/superAdminSync");
async function main() {
    await (0, database_1.default)();
    await (0, superAdminSync_1.syncSuperAdminFromEnv)();
    const email = (0, superAdminSync_1.getConfiguredAdminEmail)();
    if (!email) {
        console.error('Set ADMIN_EMAIL in the backend .env, then run this script again.');
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
        const admin = await Admin_1.default.findOne({ email });
        if (admin) {
            admin.passwordHash = await bcryptjs_1.default.hash(password, 10);
            await admin.save();
            console.log('Updated super admin password from ADMIN_PASSWORD for:', email);
        }
    }
    else {
        console.log('Super admin:', email, '(use admin panel reset flow to set password, or set ADMIN_PASSWORD for this script)');
    }
    process.exit(0);
}
void main().catch((err) => {
    console.error(err);
    process.exit(1);
});
