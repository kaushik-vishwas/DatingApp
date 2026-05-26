import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export type ReceiverEarningModel = 'score_based' | 'fixed_per_minute';

export interface IFixedPerMinuteWindow {
  id: string;
  label: string;
  from: string;
  to: string;
  ratePerMinute: number;
}

export interface IReceiverWelcomeSettings {
  enabled: boolean;
  title: string;
  body: string;
}

export interface IAdminSettings {
  notificationControls: {
    kycSubmissionsEmail: boolean;
    pendingWithdrawalsEmail: boolean;
    dailyRevenueSummaryEmail: boolean;
  };
  receiverEarningModel: ReceiverEarningModel;
  fixedPerMinuteWindows: IFixedPerMinuteWindow[];
  receiverWelcome: IReceiverWelcomeSettings;
  createdAt: Date;
  updatedAt: Date;
}

export type AdminSettingsDocument = HydratedDocument<IAdminSettings>;

const fixedWindowSchema = new Schema<IFixedPerMinuteWindow>(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    from: { type: String, required: true, trim: true },
    to: { type: String, required: true, trim: true },
    ratePerMinute: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const adminSettingsSchema = new Schema<IAdminSettings>(
  {
    notificationControls: {
      kycSubmissionsEmail: { type: Boolean, default: true },
      pendingWithdrawalsEmail: { type: Boolean, default: true },
      dailyRevenueSummaryEmail: { type: Boolean, default: true },
    },
    receiverEarningModel: {
      type: String,
      enum: ['score_based', 'fixed_per_minute'],
      default: 'score_based',
    },
    fixedPerMinuteWindows: {
      type: [fixedWindowSchema],
      default: [],
    },
    receiverWelcome: {
      enabled: { type: Boolean, default: true },
      title: { type: String, default: 'Welcome to Selecto', trim: true, maxlength: 120 },
      body: { type: String, default: '', trim: true, maxlength: 3000 },
    },
  },
  { timestamps: true }
);

const AdminSettings: Model<IAdminSettings> = mongoose.model<IAdminSettings>(
  'AdminSettings',
  adminSettingsSchema
);

export default AdminSettings;
