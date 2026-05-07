import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface IAdminSettings {
  notificationControls: {
    kycSubmissionsEmail: boolean;
    pendingWithdrawalsEmail: boolean;
    dailyRevenueSummaryEmail: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export type AdminSettingsDocument = HydratedDocument<IAdminSettings>;

const adminSettingsSchema = new Schema<IAdminSettings>(
  {
    notificationControls: {
      kycSubmissionsEmail: { type: Boolean, default: true },
      pendingWithdrawalsEmail: { type: Boolean, default: true },
      dailyRevenueSummaryEmail: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

const AdminSettings: Model<IAdminSettings> = mongoose.model<IAdminSettings>(
  'AdminSettings',
  adminSettingsSchema
);

export default AdminSettings;

