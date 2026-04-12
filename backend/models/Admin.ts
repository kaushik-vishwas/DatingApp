import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface IAdmin {
  email: string;
  passwordHash: string;
  name: string;
  role: 'super_admin';
  otp?: string | null;
  otpExpiry?: Date | null;
  pendingEmail?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AdminDocument = HydratedDocument<IAdmin>;

const adminSchema = new Schema<IAdmin>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ['super_admin'], default: 'super_admin' },
    otp: { type: String, default: null },
    otpExpiry: { type: Date, default: null },
    pendingEmail: { type: String, default: null, lowercase: true, trim: true },
  },
  { timestamps: true }
);

const Admin: Model<IAdmin> = mongoose.model<IAdmin>('Admin', adminSchema);

export default Admin;
