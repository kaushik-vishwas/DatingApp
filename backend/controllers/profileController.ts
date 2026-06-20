import type { Request, Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import User, { type Gender, type UserDocument } from '../models/User';
import Receiver, {
  RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN,
  type ReceiverDocument,
} from '../models/Receiver';
import ChatMessage from '../models/ChatMessage';
import WithdrawalRequest from '../models/WithdrawalRequest';
import CallSession from '../models/CallSession';
import ChatBlock from '../models/ChatBlock';
import UserReport from '../models/UserReport';
import WalletTopup from '../models/WalletTopup';
import WalletCredit from '../models/WalletCredit';
import ReceiverWalletCredit from '../models/ReceiverWalletCredit';
import CallerOnlineNotification from '../models/CallerOnlineNotification';
import ReceiverAvailabilityNotification from '../models/ReceiverAvailabilityNotification';
import ReceiverPriorityNotification from '../models/ReceiverPriorityNotification';
import ReceiverRating from '../models/ReceiverRating';
import { CALLER_INTEREST_ALLOWLIST, CALLER_LANGUAGE_ALLOWLIST } from '../constants/callerProfileAllowlist';
import { toApiReceiver, toApiUser } from './authController';
import { blockReceiverUntilApproved } from '../utils/accountAccess';
import { CHAT_TEXT_FEE_INR } from '../constants/chatPricing';
import { scheduleReceiverAvailabilityNotifications } from '../services/receiverAvailabilityNotifier';
import {
  clearReceiverDiscoverGrace,
  syncReceiverPresenceInDatabase,
  touchReceiverBackgroundPresence,
  touchReceiverForegroundPresence,
} from '../services/receiverPresence';
import { isReceiverSocketConnected } from '../socket/socketRegistry';
import {
  verifyVoiceGender,
  voiceGenderThreshold,
  getVoiceVerificationMode,
  type ExpectedVoiceGender,
} from '../services/callerVoiceGenderVerifier';
import { finalizeReceiverOnlineSession } from '../services/receiverScore';
import { trackAndFinalizeRazorpayXPayout } from '../services/razorpayXPayoutService';
import { emitReceiverWithdrawalUpdate } from '../socket/socketRegistry';
import { beginApiTrace, mongoErrCode, reuseOrCreateApiTrace } from '../utils/apiTraceLog';
import { CALLER_MESSAGE_MIN_DURATION_SEC } from '../utils/callerMessageEligibility';
import { MISSED_OR_INCOMPLETE_MAX_SEC } from './callController';
import { getReceiverEarningSettings, publicEarningSchedulePayload } from '../services/receiverEarningModel';
import { getReceiverWelcomeSettings } from '../services/receiverWelcome';
import { getCallerNotificationSettings } from '../services/callerNotification';

function callerCallNotificationSubtitle(durationSec: number): string {
  const d = Math.max(0, Math.floor(Number(durationSec) || 0));
  if (d <= 0) return 'Missed call · not connected';
  if (d < MISSED_OR_INCOMPLETE_MAX_SEC) return `Incomplete call · ${d}s`;
  const mins = Math.max(1, Math.round(d / 60));
  return `Completed · ${mins} min`;
}

type CompleteProfileBody = {
  name: string;
  profileImage: string;
  aadhaarFront: string;
  aadhaarBack: string;
  aadhaarNumber: string;
  panNumber: string;
  panFront: string;
  languages: string[];
  interests: string[];
  gender: Gender;
  state: string;
  bankAccountHolderName: string;
  bankAccountType: 'savings' | 'current';
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
  /** Optional HTTPS URL of recorded voice sample (omit when UI-only flow). */
  userAudio?: string;
};

/** PATCH /profile/receiver/kyc/profile-info — step 1 (incremental save). */
type ReceiverKycProfileInfoBody = {
  name: string;
  profileImage: string;
  languages: string[];
  interests: string[];
  gender: Gender;
  state: string;
};

/** PATCH /profile/receiver/kyc/documents — step 2 (incremental save). */
type ReceiverKycDocumentsBody = {
  aadhaarFront: string;
  aadhaarBack: string;
  aadhaarNumber: string;
  panNumber: string;
  panFront: string;
};

/** PATCH /profile/receiver/kyc/bank — step 3 (bank only; marks KYC approved). */
type ReceiverKycBankBody = {
  bankAccountHolderName: string;
  bankAccountType: 'savings' | 'current';
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
};

type CompleteCallerBody = {
  name: string;
  profileImage: string;
  languages: string[];
  interests: string[];
  gender: Gender;
  state: string;
  /** HTTPS URL of recorded voice (MongoDB field: `userAudio`). */
  userAudio?: string;
  /** @deprecated use `userAudio` */
  voiceVerificationAudioUrl?: string;
};

type CallerVoiceVerificationPayload = {
  provider: 'huggingface' | 'local';
  approved: boolean;
  predictedGender: 'female' | 'male' | 'other' | 'unknown';
  confidence: number;
  threshold: number;
  model: string;
  reason?: string;
  failureKind?:
    | 'gender_mismatch'
    | 'low_confidence'
    | 'service_unavailable'
    | 'audio_fetch_failed'
    | 'misconfigured';
  profileGender?: 'female' | 'male' | 'other';
};

type CallerAudioPatchBody = { userAudio?: string; voiceVerificationAudioUrl?: string };

type UpdateCallerBody = Omit<CompleteCallerBody, 'userAudio' | 'voiceVerificationAudioUrl'>;
type UpdateReceiverBody = {
  name?: string;
  profileImage?: string;
  languages?: string[];
  interests?: string[];
  state?: string;
  aadhaarNumber?: string;
  panNumber?: string;
  aadhaarFront?: string;
  aadhaarBack?: string;
  panFront?: string;
  audioCallRate?: number;
  isAvailable?: boolean;
  gender?: Gender | null;
  /** Voice sample URL (https). When profile fields are complete, promotes `pending_profile` → `approved`. */
  userAudio?: string;
  age?: number;
};

function receiverOnboardingProfileFieldsComplete(r: ReceiverDocument): boolean {
  return Boolean(
    r.name?.trim() &&
      r.profileImage?.trim() &&
      r.state?.trim() &&
      Array.isArray(r.languages) &&
      r.languages.length > 0 &&
      Array.isArray(r.interests) &&
      r.interests.length > 0
  );
}
type ReceiverBankUpdateBody = {
  nameAsPerAadhaar?: string;
  upiId?: string;
  aadhaarNumber?: string;
  panNumber?: string;
  aadhaarFront?: string;
  aadhaarBack?: string;
  panFront?: string;
};

function normalizeUpiId(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

function isValidUpiId(upi: string): boolean {
  return /^[a-z0-9._-]{2,256}@[a-z]{3,}$/i.test(upi);
}

function maskUpiId(upi: string): string {
  const trimmed = upi.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return '****';
  return `****${trimmed.slice(at)}`;
}

function receiverPaymentDetailsComplete(r: {
  nameAsPerAadhaar?: string | null;
  upiId?: string | null;
  aadhaarNumber?: string | null;
  panNumber?: string | null;
}): boolean {
  const aadhaarDigits = String(r.aadhaarNumber ?? '').replace(/\D/g, '');
  const pan = String(r.panNumber ?? '').trim().toUpperCase();
  return Boolean(
    r.nameAsPerAadhaar?.trim() &&
      r.upiId?.trim() &&
      isValidUpiId(normalizeUpiId(r.upiId)) &&
      /^\d{12}$/.test(aadhaarDigits) &&
      /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan),
  );
}

function parseCallerAudioHttpsUrl(body: CallerAudioPatchBody): string | null {
  const raw =
    typeof body.userAudio === 'string'
      ? body.userAudio
      : typeof body.voiceVerificationAudioUrl === 'string'
        ? body.voiceVerificationAudioUrl
        : '';
  const voiceUrl = raw.trim();
  if (!voiceUrl || !/^https?:\/\//i.test(voiceUrl)) return null;
  return voiceUrl;
}

const MAX_CALLER_EDIT_INTERESTS = 3;
const MAX_CALLER_EDIT_LANGUAGES = 2;

function filterAllowlisted(
  arr: unknown,
  allow: Set<string>,
  max: number
): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const x of arr) {
    const s = typeof x === 'string' ? x.trim() : '';
    if (!s || !allow.has(s)) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * POST /profile/complete — receiver KYC finalize (mounted at `{API_ORIGIN}/profile/complete`).
 *
 * Headers: `Authorization: Bearer <receiver JWT>` (`typ: r`), `Content-Type: application/json`
 *
 * JSON body (`CompleteProfileBody`):
 * - `name`, `profileImage`, `aadhaarFront`, `aadhaarBack`, `aadhaarNumber`, `panNumber`, `panFront` (URLs for images/docs)
 * - `languages: string[]`, `interests: string[]`
 * - `gender`: `male` | `female` | `other`
 * - `state`, `bankAccountHolderName`, `bankAccountType`: `savings` | `current`, `bankAccountNumber`, `bankIfsc`, `bankName`
 * - `userAudio` (optional HTTPS URL — voice capture may be UI-only without upload)
 *
 * Response header: `X-Complete-Profile-Trace-Id` mirrors `traceId` in JSON for log correlation.
 *
 * Saves receiver profile and activates account immediately (no admin approval gate).
 */
export const completeProfile = async (
  req: Request<{}, {}, CompleteProfileBody>,
  res: Response
): Promise<void> => {
  const traceId = reuseOrCreateApiTrace(res);
  res.set('X-Complete-Profile-Trace-Id', traceId);
  const log = (stage: string, details?: Record<string, unknown>) => {
    console.log('[completeProfile]', JSON.stringify({ traceId, stage, ...(details ?? {}) }));
  };
  const warn = (stage: string, details?: Record<string, unknown>) => {
    console.warn('[completeProfile]', JSON.stringify({ traceId, stage, ...(details ?? {}) }));
  };
  /** JSON body fields are listed in README-style comment above this handler — never log raw IDs or URLs at info level here. */
  const reply = (status: number, body: Record<string, unknown>): void => {
    res.status(status).json({ traceId, ...body });
  };
  try {
    log('start', {
      accountKind: req.accountKind,
      receiverId: req.receiver?._id ? String(req.receiver._id) : null,
    });
    log('request_outline', {
      httpMethod: req.method,
      path: req.originalUrl ?? req.url,
      contentLengthHeader: req.get('content-length') ?? null,
      fields:
        typeof req.body === 'object' && req.body && !Array.isArray(req.body)
          ? Object.keys(req.body as object).sort()
          : [],
      authPresent: typeof req.headers.authorization === 'string' && req.headers.authorization.length > 10,
      userAgent: typeof req.headers['user-agent'] === 'string'
        ? (req.headers['user-agent'] as string).slice(0, 180)
        : null,
    });
    if (req.accountKind !== 'receiver') {
      warn('forbidden_account_kind', { accountKind: req.accountKind });
      reply(403, {
        message: 'This endpoint is only for receiver accounts',
        error: 'COMPLETE_PROFILE_ACCOUNT_KIND_RECEIVER_REQUIRED',
      });
      return;
    }

    const authReceiver = req.receiver as ReceiverDocument | undefined;
    if (!authReceiver?._id) {
      warn('unauthorized_missing_receiver');
      reply(401, { message: 'Not authorized', error: 'COMPLETE_PROFILE_UNAUTHORIZED' });
      return;
    }

    const {
      name,
      profileImage,
      aadhaarFront,
      aadhaarBack,
      aadhaarNumber,
      panNumber,
      panFront,
      languages,
      interests,
      gender,
      state,
      bankAccountHolderName,
      bankAccountType,
      bankAccountNumber,
      bankIfsc,
      bankName,
      userAudio,
    } = req.body;

    if (!name || !String(name).trim()) {
      warn('validation_failed_name');
      reply(400, { message: 'name is required', error: 'COMPLETE_PROFILE_MISSING_NAME' });
      return;
    }
    if (!profileImage || typeof profileImage !== 'string') {
      warn('validation_failed_profile_image');
      reply(400, { message: 'profileImage URL is required', error: 'COMPLETE_PROFILE_MISSING_PROFILE_IMAGE' });
      return;
    }
    if (!aadhaarFront || typeof aadhaarFront !== 'string') {
      warn('validation_failed_aadhaar_front');
      reply(400, { message: 'aadhaarFront URL is required', error: 'COMPLETE_PROFILE_MISSING_AADHAAR_FRONT' });
      return;
    }
    if (!aadhaarBack || typeof aadhaarBack !== 'string') {
      warn('validation_failed_aadhaar_back');
      reply(400, { message: 'aadhaarBack URL is required', error: 'COMPLETE_PROFILE_MISSING_AADHAAR_BACK' });
      return;
    }
    if (!aadhaarNumber || typeof aadhaarNumber !== 'string' || !/^\d{12}$/.test(aadhaarNumber.trim())) {
      warn('validation_failed_aadhaar_number');
      reply(400, {
        message: 'aadhaarNumber must be a valid 12-digit number',
        error: 'COMPLETE_PROFILE_INVALID_AADHAAR_NUMBER',
      });
      return;
    }
    if (
      !panNumber ||
      typeof panNumber !== 'string' ||
      !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(panNumber.trim())
    ) {
      warn('validation_failed_pan_number');
      reply(400, {
        message: 'panNumber must be valid (e.g. ABCDE1234F)',
        error: 'COMPLETE_PROFILE_INVALID_PAN_NUMBER',
      });
      return;
    }
    if (!panFront || typeof panFront !== 'string') {
      warn('validation_failed_pan_front');
      reply(400, { message: 'panFront URL is required', error: 'COMPLETE_PROFILE_MISSING_PAN_FRONT' });
      return;
    }
    if (!Array.isArray(languages) || languages.length === 0) {
      warn('validation_failed_languages');
      reply(400, { message: 'At least one language is required', error: 'COMPLETE_PROFILE_MISSING_LANGUAGES' });
      return;
    }
    if (!Array.isArray(interests) || interests.length === 0) {
      warn('validation_failed_interests');
      reply(400, { message: 'At least one interest is required', error: 'COMPLETE_PROFILE_MISSING_INTERESTS' });
      return;
    }
    if (gender !== 'male' && gender !== 'female' && gender !== 'other') {
      warn('validation_failed_gender');
      reply(400, { message: 'gender must be male, female, or other', error: 'COMPLETE_PROFILE_INVALID_GENDER' });
      return;
    }
    if (!state || !String(state).trim()) {
      warn('validation_failed_state');
      reply(400, { message: 'state is required', error: 'COMPLETE_PROFILE_MISSING_STATE' });
      return;
    }
    if (!bankAccountHolderName || !String(bankAccountHolderName).trim()) {
      warn('validation_failed_bank_holder');
      reply(400, {
        message: 'bankAccountHolderName is required',
        error: 'COMPLETE_PROFILE_MISSING_BANK_HOLDER',
      });
      return;
    }
    if (bankAccountType !== 'savings' && bankAccountType !== 'current') {
      warn('validation_failed_bank_type');
      reply(400, {
        message: 'bankAccountType must be savings or current',
        error: 'COMPLETE_PROFILE_INVALID_BANK_TYPE',
      });
      return;
    }
    if (!bankAccountNumber || !String(bankAccountNumber).trim()) {
      warn('validation_failed_bank_number');
      reply(400, { message: 'bankAccountNumber is required', error: 'COMPLETE_PROFILE_MISSING_BANK_NUMBER' });
      return;
    }
    if (!bankIfsc || !String(bankIfsc).trim()) {
      warn('validation_failed_ifsc');
      reply(400, { message: 'bankIfsc is required', error: 'COMPLETE_PROFILE_MISSING_IFSC' });
      return;
    }
    if (!bankName || !String(bankName).trim()) {
      warn('validation_failed_bank_name');
      reply(400, { message: 'bankName is required', error: 'COMPLETE_PROFILE_MISSING_BANK_NAME' });
      return;
    }
    const receiverVoiceUrl =
      typeof userAudio === 'string' && /^https?:\/\//i.test(userAudio.trim())
        ? userAudio.trim()
        : null;
    log('validation_passed', {
      hasUserAudio: Boolean(receiverVoiceUrl),
      languagesCount: Array.isArray(languages) ? languages.length : 0,
      interestsCount: Array.isArray(interests) ? interests.length : 0,
    });
    const receiver = await Receiver.findById(authReceiver._id);
    if (!receiver) {
      warn('receiver_not_found', { receiverId: String(authReceiver._id) });
      reply(404, { message: 'Receiver not found', error: 'COMPLETE_PROFILE_RECEIVER_ROW_MISSING' });
      return;
    }

    if (receiver.accountStatus !== 'pending_profile') {
      warn('invalid_account_status', { accountStatus: receiver.accountStatus });
      reply(400, {
        message: 'Profile already submitted or cannot be edited this way',
        error: 'COMPLETE_PROFILE_WRONG_ACCOUNT_STATUS',
        accountStatus: receiver.accountStatus,
      });
      return;
    }

    const front = String(aadhaarFront).trim();
    const back = String(aadhaarBack).trim();
    const panFrontUrl = String(panFront).trim();

    receiver.name = String(name).trim();
    receiver.profileImage = profileImage.trim();
    receiver.aadhaarFront = front;
    receiver.aadhaarBack = back;
    receiver.aadhaarNumber = String(aadhaarNumber).trim();
    receiver.panNumber = String(panNumber).trim().toUpperCase();
    receiver.panFront = panFrontUrl;
    receiver.documents = [front, back, panFrontUrl];
    receiver.languages = languages.map((l) => String(l).trim()).filter(Boolean);
    receiver.interests = interests.map((i) => String(i).trim()).filter(Boolean);
    receiver.gender = gender;
    receiver.state = String(state).trim();
    receiver.bankAccountHolderName = String(bankAccountHolderName).trim();
    receiver.bankAccountType = bankAccountType;
    receiver.bankAccountNumber = String(bankAccountNumber).trim();
    receiver.bankIfsc = String(bankIfsc).trim().toUpperCase();
    receiver.bankName = String(bankName).trim();
    receiver.audioCallRate = RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN;
    receiver.userAudio = receiverVoiceUrl ?? null;
    receiver.accountStatus = 'approved';

    log('before_save', { receiverId: String(receiver._id), nextAccountStatus: 'approved' });
    await receiver.save();
    log('save_success', { receiverId: String(receiver._id) });

    reply(200, {
      message: 'Profile completed successfully',
      user: toApiReceiver(receiver),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('completeProfile error:', {
      traceId,
      message: msg,
      stack: err instanceof Error ? err.stack : undefined,
      name: err instanceof Error ? err.name : undefined,
      code:
        typeof err === 'object' &&
        err &&
        err !== null &&
        'code' in err &&
        typeof (err as { code?: unknown }).code !== 'undefined'
          ? String((err as { code?: unknown }).code)
          : undefined,
    });
    reply(500, {
      message: msg || 'Server error',
      error: 'COMPLETE_PROFILE_FAILED',
      ...(err instanceof mongoose.Error.ValidationError ? { errorHint: 'MONGOOSE_VALIDATION' as const } : {}),
    });
  }
};

/**
 * PATCH /profile/receiver/kyc/profile-info — receiver KYC step 1 (name, photo URL, languages, etc.).
 */
export const saveReceiverKycProfileInfo = async (
  req: Request<{}, {}, ReceiverKycProfileInfoBody>,
  res: Response
): Promise<void> => {
  const t = beginApiTrace('PATCH /profile/receiver/kyc/profile-info', req, res);
  try {
    if (req.accountKind !== 'receiver') {
      t.warn('kyc_profile_info_account_kind');
      t.json(403, {
        message: 'This endpoint is only for receiver accounts',
        error: 'KYC_PROFILE_INFO_RECEIVER_ONLY',
      });
      return;
    }
    const authReceiver = req.receiver as ReceiverDocument | undefined;
    if (!authReceiver?._id) {
      t.json(401, { message: 'Not authorized', error: 'KYC_PROFILE_INFO_UNAUTHORIZED' });
      return;
    }

    const { name, profileImage, languages, interests, gender, state } = req.body;
    if (!name || !String(name).trim()) {
      t.json(400, { message: 'name is required', error: 'KYC_PROFILE_INFO_MISSING_NAME' });
      return;
    }
    if (!profileImage || typeof profileImage !== 'string' || !/^https?:\/\//i.test(profileImage.trim())) {
      t.json(400, {
        message: 'profileImage must be a valid http(s) URL',
        error: 'KYC_PROFILE_INFO_BAD_PROFILE_IMAGE',
      });
      return;
    }
    if (!Array.isArray(languages) || languages.length === 0) {
      t.json(400, {
        message: 'At least one language is required',
        error: 'KYC_PROFILE_INFO_MISSING_LANGUAGES',
      });
      return;
    }
    if (!Array.isArray(interests) || interests.length === 0) {
      t.json(400, {
        message: 'At least one interest is required',
        error: 'KYC_PROFILE_INFO_MISSING_INTERESTS',
      });
      return;
    }
    if (gender !== 'male' && gender !== 'female' && gender !== 'other') {
      t.json(400, { message: 'gender must be male, female, or other', error: 'KYC_PROFILE_INFO_INVALID_GENDER' });
      return;
    }
    if (!state || !String(state).trim()) {
      t.json(400, { message: 'state is required', error: 'KYC_PROFILE_INFO_MISSING_STATE' });
      return;
    }

    const receiver = await Receiver.findById(authReceiver._id);
    if (!receiver) {
      t.json(404, { message: 'Receiver not found', error: 'KYC_PROFILE_INFO_NOT_FOUND' });
      return;
    }
    if (receiver.accountStatus !== 'pending_profile') {
      t.json(400, {
        message: 'Profile already submitted or cannot be edited this way',
        error: 'KYC_PROFILE_INFO_WRONG_STATUS',
        accountStatus: receiver.accountStatus,
      });
      return;
    }

    receiver.name = String(name).trim();
    receiver.profileImage = String(profileImage).trim();
    receiver.languages = languages.map((l) => String(l).trim()).filter(Boolean);
    receiver.interests = interests.map((i) => String(i).trim()).filter(Boolean);
    receiver.gender = gender;
    receiver.state = String(state).trim();
    await receiver.save();

    t.log('kyc_profile_info_ok');
    t.json(200, { message: 'Profile info saved', user: toApiReceiver(receiver) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('kyc_profile_info_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, { message: msg || 'Server error', error: 'KYC_PROFILE_INFO_FAILED' });
  }
};

/**
 * PATCH /profile/receiver/kyc/documents — receiver KYC step 2 (ID document URLs + numbers).
 */
export const saveReceiverKycDocuments = async (
  req: Request<{}, {}, ReceiverKycDocumentsBody>,
  res: Response
): Promise<void> => {
  const t = beginApiTrace('PATCH /profile/receiver/kyc/documents', req, res);
  try {
    if (req.accountKind !== 'receiver') {
      t.json(403, {
        message: 'This endpoint is only for receiver accounts',
        error: 'KYC_DOCS_RECEIVER_ONLY',
      });
      return;
    }
    const authReceiver = req.receiver as ReceiverDocument | undefined;
    if (!authReceiver?._id) {
      t.json(401, { message: 'Not authorized', error: 'KYC_DOCS_UNAUTHORIZED' });
      return;
    }

    const { aadhaarFront, aadhaarBack, aadhaarNumber, panNumber, panFront } = req.body;
    if (!aadhaarFront || typeof aadhaarFront !== 'string' || !aadhaarFront.trim()) {
      t.json(400, { message: 'aadhaarFront is required', error: 'KYC_DOCS_MISSING_AADHAAR_FRONT' });
      return;
    }
    if (!aadhaarBack || typeof aadhaarBack !== 'string' || !aadhaarBack.trim()) {
      t.json(400, { message: 'aadhaarBack is required', error: 'KYC_DOCS_MISSING_AADHAAR_BACK' });
      return;
    }
    if (!aadhaarNumber || typeof aadhaarNumber !== 'string' || !/^\d{12}$/.test(aadhaarNumber.trim())) {
      t.json(400, {
        message: 'aadhaarNumber must be a valid 12-digit number',
        error: 'KYC_DOCS_INVALID_AADHAAR_NUMBER',
      });
      return;
    }
    if (
      !panNumber ||
      typeof panNumber !== 'string' ||
      !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(panNumber.trim())
    ) {
      t.json(400, {
        message: 'panNumber must be valid (e.g. ABCDE1234F)',
        error: 'KYC_DOCS_INVALID_PAN_NUMBER',
      });
      return;
    }
    if (!panFront || typeof panFront !== 'string' || !panFront.trim()) {
      t.json(400, { message: 'panFront is required', error: 'KYC_DOCS_MISSING_PAN_FRONT' });
      return;
    }

    const receiver = await Receiver.findById(authReceiver._id);
    if (!receiver) {
      t.json(404, { message: 'Receiver not found', error: 'KYC_DOCS_NOT_FOUND' });
      return;
    }
    if (receiver.accountStatus !== 'pending_profile') {
      t.json(400, {
        message: 'Profile already submitted or cannot be edited this way',
        error: 'KYC_DOCS_WRONG_STATUS',
        accountStatus: receiver.accountStatus,
      });
      return;
    }
    if (!receiver.profileImage || !String(receiver.profileImage).trim()) {
      t.json(400, {
        message: 'Complete step 1 (profile info) before uploading documents',
        error: 'KYC_DOCS_STEP1_REQUIRED',
      });
      return;
    }

    const front = String(aadhaarFront).trim();
    const back = String(aadhaarBack).trim();
    const panFrontUrl = String(panFront).trim();

    receiver.aadhaarFront = front;
    receiver.aadhaarBack = back;
    receiver.aadhaarNumber = String(aadhaarNumber).trim();
    receiver.panNumber = String(panNumber).trim().toUpperCase();
    receiver.panFront = panFrontUrl;
    receiver.documents = [front, back, panFrontUrl];
    await receiver.save();

    t.log('kyc_documents_ok');
    t.json(200, { message: 'Documents saved', user: toApiReceiver(receiver) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('kyc_documents_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, { message: msg || 'Server error', error: 'KYC_DOCS_FAILED' });
  }
};

/**
 * PATCH /profile/receiver/kyc/bank — receiver KYC step 3 (bank only; approves account like POST /profile/complete).
 */
export const saveReceiverKycBankFinalize = async (
  req: Request<{}, {}, ReceiverKycBankBody>,
  res: Response
): Promise<void> => {
  const t = beginApiTrace('PATCH /profile/receiver/kyc/bank', req, res);
  try {
    if (req.accountKind !== 'receiver') {
      t.json(403, {
        message: 'This endpoint is only for receiver accounts',
        error: 'KYC_BANK_RECEIVER_ONLY',
      });
      return;
    }
    const authReceiver = req.receiver as ReceiverDocument | undefined;
    if (!authReceiver?._id) {
      t.json(401, { message: 'Not authorized', error: 'KYC_BANK_UNAUTHORIZED' });
      return;
    }

    const { bankAccountHolderName, bankAccountType, bankAccountNumber, bankIfsc, bankName } = req.body;
    if (!bankAccountHolderName || !String(bankAccountHolderName).trim()) {
      t.json(400, {
        message: 'bankAccountHolderName is required',
        error: 'KYC_BANK_MISSING_HOLDER',
      });
      return;
    }
    if (bankAccountType !== 'savings' && bankAccountType !== 'current') {
      t.json(400, {
        message: 'bankAccountType must be savings or current',
        error: 'KYC_BANK_INVALID_TYPE',
      });
      return;
    }
    if (!bankAccountNumber || !String(bankAccountNumber).trim()) {
      t.json(400, { message: 'bankAccountNumber is required', error: 'KYC_BANK_MISSING_NUMBER' });
      return;
    }
    if (!bankIfsc || !String(bankIfsc).trim()) {
      t.json(400, { message: 'bankIfsc is required', error: 'KYC_BANK_MISSING_IFSC' });
      return;
    }
    if (!bankName || !String(bankName).trim()) {
      t.json(400, { message: 'bankName is required', error: 'KYC_BANK_MISSING_BANK_NAME' });
      return;
    }

    const receiver = await Receiver.findById(authReceiver._id);
    if (!receiver) {
      t.json(404, { message: 'Receiver not found', error: 'KYC_BANK_NOT_FOUND' });
      return;
    }
    if (receiver.accountStatus !== 'pending_profile') {
      t.json(400, {
        message: 'Profile already submitted or cannot be edited this way',
        error: 'KYC_BANK_WRONG_STATUS',
        accountStatus: receiver.accountStatus,
      });
      return;
    }

    if (!receiver.profileImage?.trim()) {
      t.json(400, { message: 'Complete step 1 first', error: 'KYC_BANK_STEP1_REQUIRED' });
      return;
    }
    if (!receiver.aadhaarFront?.trim() || !receiver.aadhaarBack?.trim() || !receiver.panFront?.trim()) {
      t.json(400, { message: 'Complete step 2 (documents) first', error: 'KYC_BANK_STEP2_REQUIRED' });
      return;
    }
    if (!receiver.aadhaarNumber?.trim() || !receiver.panNumber?.trim()) {
      t.json(400, { message: 'Complete step 2 (documents) first', error: 'KYC_BANK_STEP2_NUMBERS_REQUIRED' });
      return;
    }
    if (!receiver.languages?.length || !receiver.interests?.length || !receiver.gender) {
      t.json(400, { message: 'Complete step 1 (profile info) first', error: 'KYC_BANK_PROFILE_INCOMPLETE' });
      return;
    }
    if (!receiver.state?.trim()) {
      t.json(400, { message: 'Complete step 1 (profile info) first', error: 'KYC_BANK_STATE_REQUIRED' });
      return;
    }

    const front = String(receiver.aadhaarFront).trim();
    const back = String(receiver.aadhaarBack).trim();
    const panFrontUrl = String(receiver.panFront).trim();
    receiver.documents = [front, back, panFrontUrl];

    receiver.bankAccountHolderName = String(bankAccountHolderName).trim();
    receiver.bankAccountType = bankAccountType;
    receiver.bankAccountNumber = String(bankAccountNumber).trim();
    receiver.bankIfsc = String(bankIfsc).trim().toUpperCase();
    receiver.bankName = String(bankName).trim();
    receiver.audioCallRate = RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN;
    receiver.accountStatus = 'approved';

    await receiver.save();

    t.log('kyc_bank_finalize_ok');
    t.json(200, { message: 'Profile completed successfully', user: toApiReceiver(receiver) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('kyc_bank_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, { message: msg || 'Server error', error: 'KYC_BANK_FAILED' });
  }
};

/**
 * PATCH /profile/caller-audio
 * Saves `userAudio` (HTTPS URL) on the caller while `accountStatus` is `pending_profile`
 * (right after Cloudinary upload, before the rest of the profile is submitted).
 */
export const saveCallerUserAudio = async (
  req: Request<{}, {}, CallerAudioPatchBody>,
  res: Response
): Promise<void> => {
  const t = beginApiTrace('PATCH /profile/caller-audio', req, res);
  try {
    if (req.accountKind !== 'user') {
      t.warn('caller_audio_account_kind');
      t.json(403, {
        message: 'This endpoint is only for app user accounts',
        error: 'CALLER_AUDIO_ACCOUNT_KIND_USER_REQUIRED',
      });
      return;
    }

    const authUser = req.user as UserDocument | undefined;
    if (!authUser?._id) {
      t.warn('caller_audio_unauthorized');
      t.json(401, { message: 'Not authorized', error: 'CALLER_AUDIO_UNAUTHORIZED' });
      return;
    }

    const voiceUrl = parseCallerAudioHttpsUrl(req.body);
    if (!voiceUrl) {
      t.warn('caller_audio_invalid_url');
      t.json(400, { message: 'userAudio must be a valid https URL', error: 'CALLER_AUDIO_INVALID_URL' });
      return;
    }

    const updated = await User.findOneAndUpdate(
      { _id: authUser._id, accountStatus: 'pending_profile' },
      { $set: { userAudio: voiceUrl } },
      { new: true, runValidators: true }
    );

    if (!updated) {
      t.warn('caller_audio_wrong_status_or_row');
      t.json(400, {
        message: 'Voice can only be saved while your profile is still in progress',
        error: 'CALLER_AUDIO_NOT_PENDING_PROFILE',
      });
      return;
    }

    t.log('caller_audio_saved');
    t.json(200, {
      message: 'Voice sample saved',
      user: toApiUser(updated),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('caller_audio_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, { message: msg || 'Server error', error: 'CALLER_AUDIO_SAVE_FAILED' });
  }
};

/**
 * PATCH /profile/receiver-audio
 * Saves `userAudio` after Cloudinary upload (receiver audio verification step).
 */
export const saveReceiverUserAudio = async (
  req: Request<{}, {}, CallerAudioPatchBody>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({
        message: 'This endpoint is only for receiver accounts',
        error: 'RECEIVER_AUDIO_ACCOUNT_KIND_REQUIRED',
      });
      return;
    }
    if (blockReceiverUntilApproved(req, res)) return;

    const authReceiver = req.receiver as ReceiverDocument | undefined;
    if (!authReceiver?._id) {
      res.status(401).json({ message: 'Not authorized', error: 'RECEIVER_AUDIO_UNAUTHORIZED' });
      return;
    }

    const voiceUrl = parseCallerAudioHttpsUrl(req.body);
    if (!voiceUrl) {
      res.status(400).json({
        message: 'userAudio must be a valid https URL',
        error: 'RECEIVER_AUDIO_INVALID_URL',
      });
      return;
    }

    const receiver = await Receiver.findById(authReceiver._id);
    if (!receiver) {
      res.status(404).json({ message: 'Receiver not found', error: 'RECEIVER_AUDIO_NOT_FOUND' });
      return;
    }

    receiver.userAudio = voiceUrl;
    await receiver.save();

    res.status(200).json({
      message: 'Voice sample saved',
      user: toApiReceiver(receiver),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('saveReceiverUserAudio error:', msg);
    res.status(500).json({ message: msg || 'Server error', error: 'RECEIVER_AUDIO_SAVE_FAILED' });
  }
};

function buildVoiceVerificationPayload(
  expectedGender: ExpectedVoiceGender,
  result: Awaited<ReturnType<typeof verifyVoiceGender>>
): CallerVoiceVerificationPayload {
  return {
    provider:
      result.model.startsWith('Xenova/') ||
      result.model === 'voice-gender-worker' ||
      result.model === 'warmup'
        ? 'local'
        : 'huggingface',
    approved: result.ok,
    predictedGender: result.predictedGender,
    confidence: result.confidence,
    threshold: voiceGenderThreshold(expectedGender),
    model: result.model,
    profileGender: expectedGender,
    ...(result.failureKind ? { failureKind: result.failureKind } : {}),
    ...(result.reason ? { reason: result.reason } : {}),
  };
}

function readReceiverVoiceVerificationMode(): 'required' | 'disabled' {
  const raw = String(process.env.RECEIVER_VOICE_GENDER_VERIFICATION_MODE ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'disabled' || raw === 'off' || raw === 'skip') return 'disabled';
  if (raw === 'required' || raw === 'on' || raw === 'enabled') return 'required';
  return getVoiceVerificationMode();
}

/**
 * POST /profile/complete-caller
 * App user profile (`users` collection):
 * - male/other: direct access (`approved`, not suspended)
 * - female: auto-verify by voice classifier (`approved` or `rejected`)
 */
export const completeCallerProfile = async (
  req: Request<{}, {}, CompleteCallerBody>,
  res: Response
): Promise<void> => {
  const t = beginApiTrace('POST /profile/complete-caller', req, res);
  try {
    if (req.accountKind !== 'user') {
      t.warn('complete_caller_account_kind');
      t.json(403, {
        message: 'This endpoint is only for app user accounts',
        error: 'COMPLETE_CALLER_ACCOUNT_KIND_USER_REQUIRED',
      });
      return;
    }

    const authUser = req.user as UserDocument | undefined;
    if (!authUser?._id) {
      t.warn('complete_caller_unauthorized');
      t.json(401, { message: 'Not authorized', error: 'COMPLETE_CALLER_UNAUTHORIZED' });
      return;
    }

    const { name, profileImage, languages, interests, gender, state } = req.body;

    if (!name || !String(name).trim()) {
      t.warn('complete_caller_validation_name');
      t.json(400, { message: 'name is required', error: 'COMPLETE_CALLER_MISSING_NAME' });
      return;
    }
    if (!profileImage || typeof profileImage !== 'string') {
      t.warn('complete_caller_validation_profile_image');
      t.json(400, {
        message: 'profileImage URL is required',
        error: 'COMPLETE_CALLER_MISSING_PROFILE_IMAGE',
      });
      return;
    }
    if (gender !== 'male' && gender !== 'female' && gender !== 'other') {
      t.warn('complete_caller_validation_gender');
      t.json(400, { message: 'gender must be male, female, or other', error: 'COMPLETE_CALLER_INVALID_GENDER' });
      return;
    }
    if (!state || !String(state).trim()) {
      t.warn('complete_caller_validation_state');
      t.json(400, { message: 'state is required', error: 'COMPLETE_CALLER_MISSING_STATE' });
      return;
    }
    if (!Array.isArray(languages) || languages.length === 0) {
      t.warn('complete_caller_validation_languages');
      t.json(400, { message: 'At least one language is required', error: 'COMPLETE_CALLER_MISSING_LANGUAGES' });
      return;
    }
    if (!Array.isArray(interests) || interests.length === 0) {
      t.warn('complete_caller_validation_interests');
      t.json(400, {
        message: 'At least one interest is required',
        error: 'COMPLETE_CALLER_MISSING_INTERESTS',
      });
      return;
    }
    const voiceUrl = parseCallerAudioHttpsUrl(req.body);
    const requiresVerification = false;
    const voiceVerification: CallerVoiceVerificationPayload | undefined = undefined;
    const updated = await User.findOneAndUpdate(
      { _id: authUser._id, accountStatus: 'pending_profile' },
      {
        $set: {
          name: String(name).trim(),
          profileImage: String(profileImage).trim(),
          languages: languages.map((l) => String(l).trim()).filter(Boolean),
          interests: interests.map((i) => String(i).trim()).filter(Boolean),
          gender,
          state: String(state).trim(),
          userAudio: voiceUrl ?? null,
          accountStatus: 'approved',
          suspended: false,
        },
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      t.warn('complete_caller_bad_account_status_or_row');
      t.json(400, {
        message: 'Profile already submitted or cannot be edited this way',
        error: 'COMPLETE_CALLER_WRONG_ACCOUNT_STATE',
      });
      return;
    }

    t.log('complete_caller_ok');
    t.json(200, {
      message: 'Profile completed successfully',
      user: toApiUser(updated),
      ...(voiceVerification ? { voiceVerification } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('complete_caller_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, { message: msg || 'Server error', error: 'COMPLETE_CALLER_PROFILE_FAILED' });
  }
};

/**
 * PATCH /profile/caller — approved app users only; updates profile fields (same shape as complete-caller).
 */
export const updateCallerProfile = async (
  req: Request<{}, {}, UpdateCallerBody>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'user') {
      res.status(403).json({ message: 'This endpoint is only for app user accounts' });
      return;
    }

    const authUser = req.user as UserDocument | undefined;
    if (!authUser?._id) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const { name, profileImage, languages, interests, gender, state } = req.body;

    if (!name || !String(name).trim()) {
      res.status(400).json({ message: 'name is required' });
      return;
    }
    if (!profileImage || typeof profileImage !== 'string') {
      res.status(400).json({ message: 'profileImage URL is required' });
      return;
    }
    if (gender !== 'male' && gender !== 'female' && gender !== 'other') {
      res.status(400).json({ message: 'gender must be male, female, or other' });
      return;
    }
    if (!state || !String(state).trim()) {
      res.status(400).json({ message: 'state is required' });
      return;
    }

    const langs = filterAllowlisted(languages, CALLER_LANGUAGE_ALLOWLIST, MAX_CALLER_EDIT_LANGUAGES);
    const ints = filterAllowlisted(interests, CALLER_INTEREST_ALLOWLIST, MAX_CALLER_EDIT_INTERESTS);

    if (langs.length === 0) {
      res.status(400).json({ message: 'Select at least one valid language (max 2)' });
      return;
    }
    if (ints.length === 0) {
      res.status(400).json({ message: 'Select at least one valid interest (max 3)' });
      return;
    }

    const user = await User.findById(authUser._id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    if (user.accountStatus !== 'approved' || user.suspended) {
      res.status(400).json({ message: 'Profile can only be edited when your access is active' });
      return;
    }

    user.name = String(name).trim();
    user.profileImage = String(profileImage).trim();
    user.languages = langs;
    user.interests = ints;
    user.gender = gender;
    user.state = String(state).trim();

    await user.save();

    res.status(200).json({
      message: 'Profile updated',
      user: toApiUser(user),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('updateCallerProfile error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

function roundInr(n: number): number {
  return Math.round(n * 100) / 100;
}

async function getPendingWithdrawalAmount(receiverId: string): Promise<number> {
  const rows = await WithdrawalRequest.find({ receiverId, status: 'pending' })
    .select('amount')
    .lean<{ amount: number }[]>();
  return roundInr(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
}

async function sumReceiverDebitedWithdrawals(receiverId: string): Promise<number> {
  const rows = await WithdrawalRequest.find({
    receiverId,
    walletDebitedAt: { $ne: null },
  })
    .select('amount')
    .lean<{ amount: number }[]>();
  return roundInr(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
}

async function computeReceiverCallEarningsLifetime(
  receiverObjectId: mongoose.Types.ObjectId
): Promise<number> {
  const completedCalls = await CallSession.find({
    receiverId: receiverObjectId,
    status: 'completed',
    durationSec: { $gt: 0 },
  })
    .select('durationSec receiverEarnedInr receiverPayoutRatePerMinute')
    .lean<
      {
        durationSec: number;
        receiverEarnedInr?: number;
        receiverPayoutRatePerMinute?: number;
      }[]
    >();

  let total = 0;
  for (const row of completedCalls) {
    total += effectiveCallReceiverEarnedInr(row);
  }
  return roundInr(total);
}

type ReceiverWithdrawableSnapshot = {
  /** Lifetime earnings minus completed withdrawals minus in-flight pending requests. */
  withdrawableBalance: number;
  pendingAmount: number;
  totalEarnings: number;
  totalWithdrawn: number;
};

/**
 * Withdrawable INR = (voice call earnings + chat credits in wallet + already paid out) − paid out − pending.
 * Voice earnings live on CallSession; chat credits use `receiver.walletBalance` (debited only after payout success).
 */
async function computeReceiverWithdrawableSnapshot(
  receiverId: string,
  receiverWalletBalance: number
): Promise<ReceiverWithdrawableSnapshot> {
  const ridObj = new mongoose.Types.ObjectId(receiverId);
  const wallet = roundInr(
    typeof receiverWalletBalance === 'number' && Number.isFinite(receiverWalletBalance)
      ? receiverWalletBalance
      : 0
  );

  const [callEarnings, totalWithdrawn, pendingAmount] = await Promise.all([
    computeReceiverCallEarningsLifetime(ridObj),
    sumReceiverDebitedWithdrawals(receiverId),
    getPendingWithdrawalAmount(receiverId),
  ]);

  const totalEarnings = roundInr(callEarnings + wallet + totalWithdrawn);
  const withdrawableBalance = roundInr(Math.max(0, totalEarnings - totalWithdrawn - pendingAmount));

  return { withdrawableBalance, pendingAmount, totalEarnings, totalWithdrawn };
}

const IST_OFFSET_MINUTES = 330;

function toIstDate(d: Date): Date {
  return new Date(d.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
}

function computeLiveOnlineScore(onlineSince: Date, now: Date): number {
  if (!(onlineSince instanceof Date) || !(now instanceof Date) || now <= onlineSince) return 0;
  let dayMinutes = 0;
  let nightMinutes = 0;
  let lateNightMinutes = 0;
  const cursor = new Date(onlineSince.getTime());
  while (cursor < now) {
    const nextMinute = new Date(cursor.getTime() + 60 * 1000);
    const h = toIstDate(cursor).getUTCHours();
    if (h >= 9 && h < 21) dayMinutes += 1;
    else if (h >= 22) nightMinutes += 1;
    else if (h >= 0 && h < 2) lateNightMinutes += 1;
    cursor.setTime(nextMinute.getTime());
  }
  return roundInr(dayMinutes * 0.5 + nightMinutes * 3 + lateNightMinutes * 10);
}

function toInrAmount(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const rounded = roundInr(n);
  if (rounded < 1) return null;
  return rounded;
}

function maskAccountNumber(accountNumber: string): string {
  const trimmed = accountNumber.trim();
  const last4 = trimmed.slice(-4).padStart(4, '0');
  return `****${last4}`;
}

function otpHash(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generateOtpCode(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
}

function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length < 4) return '******';
  return `******${d.slice(-4)}`;
}

function logReceiverMobileOtp(context: string, phone: string, code: string): void {
  console.log(`[OTP] ${context} +91${phone.replace(/\D/g, '').slice(-10)} → ${code}`);
}

type MsgLean = {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  senderType: string;
  feeInr?: number;
  createdAt: Date;
};

function msgTime(m: MsgLean): Date {
  return m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt);
}

/** Paid caller fee: use stored `feeInr` when set; else legacy rows after first receiver reply count as one text fee. */
function effectiveCallerFeeInr(m: MsgLean, receiverHasReplied: boolean): number {
  if (m.senderType !== 'u') return 0;
  const stored = typeof m.feeInr === 'number' && Number.isFinite(m.feeInr) ? m.feeInr : 0;
  if (stored > 0) return roundInr(stored);
  return receiverHasReplied ? CHAT_TEXT_FEE_INR : 0;
}

/** INR credited on score-tier payout (`receiverPayoutRatePerMinute` × minutes), not caller wallet settled amount. */
function effectiveCallReceiverEarnedInr(row: {
  durationSec: number;
  receiverEarnedInr?: number;
  receiverPayoutRatePerMinute?: number;
}): number {
  if (typeof row.receiverEarnedInr === 'number' && Number.isFinite(row.receiverEarnedInr)) {
    return roundInr(row.receiverEarnedInr);
  }
  const sec = Math.max(0, Math.floor(Number(row.durationSec) || 0));
  const rate =
    typeof row.receiverPayoutRatePerMinute === 'number' && Number.isFinite(row.receiverPayoutRatePerMinute)
      ? row.receiverPayoutRatePerMinute
      : 0;
  return roundInr((sec / 60) * Math.max(0, rate));
}

/**
 * GET /profile/receiver-wallet-summary — withdrawable wallet (chat), chat fee aggregates, score-based call earnings, recent chat rows.
 * Day/month boundaries use the server's local calendar. Legacy messages without `feeInr` are counted
 * using the same rule as billing (caller pays after receiver's first reply in the thread).
 */
export const getReceiverWalletSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'Only receivers can load this summary' });
      return;
    }
    if (blockReceiverUntilApproved(req, res)) return;

    const rid = new mongoose.Types.ObjectId(String(req.receiver!._id));

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now);
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const receiver = await Receiver.findById(rid).select('walletBalance');
    const walletBalance =
      typeof receiver?.walletBalance === 'number' && Number.isFinite(receiver.walletBalance)
        ? roundInr(receiver.walletBalance)
        : 0;

    const allMessages = await ChatMessage.find({ receiverId: rid })
      .sort({ createdAt: 1 })
      .select('userId senderType feeInr createdAt')
      .lean<MsgLean[]>();

    const byUser = new Map<string, MsgLean[]>();
    for (const m of allMessages) {
      const k = String(m.userId);
      if (!byUser.has(k)) byUser.set(k, []);
      byUser.get(k)!.push(m);
    }

    let chatToday = 0;
    let chatThisMonth = 0;
    let chatEarningsThisWeek = 0;
    let chatEarningsLifetime = 0;
    const recentCandidates: { id: string; userId: string; amountInr: number; createdAt: Date }[] = [];

    for (const list of byUser.values()) {
      let receiverHasReplied = false;
      for (const m of list) {
        if (m.senderType === 'r') {
          receiverHasReplied = true;
          continue;
        }
        const t = msgTime(m);
        const fee = effectiveCallerFeeInr(m, receiverHasReplied);
        if (fee <= 0) continue;
        chatEarningsLifetime += fee;
        if (t >= startOfToday) chatToday += fee;
        if (t >= weekStart) chatEarningsThisWeek += fee;
        if (t >= startOfMonth) {
          chatThisMonth += fee;
          recentCandidates.push({
            id: String(m._id),
            userId: String(m.userId),
            amountInr: fee,
            createdAt: t,
          });
        }
      }
    }

    chatToday = roundInr(chatToday);
    chatThisMonth = roundInr(chatThisMonth);
    chatEarningsThisWeek = roundInr(chatEarningsThisWeek);
    chatEarningsLifetime = roundInr(chatEarningsLifetime);

    const completedCalls = await CallSession.find({
      receiverId: rid,
      status: 'completed',
      durationSec: { $gt: 0 },
    })
      .select('startedAt durationSec receiverEarnedInr receiverPayoutRatePerMinute')
      .lean<
        {
          startedAt: Date;
          durationSec: number;
          receiverEarnedInr?: number;
          receiverPayoutRatePerMinute?: number;
        }[]
      >();

    let callEarningsLifetime = 0;
    let callEarningsToday = 0;
    let callEarningsThisWeek = 0;
    for (const row of completedCalls) {
      const earned = effectiveCallReceiverEarnedInr(row);
      callEarningsLifetime += earned;
      if (row.startedAt >= startOfToday) callEarningsToday += earned;
      if (row.startedAt >= weekStart) callEarningsThisWeek += earned;
    }
    callEarningsLifetime = roundInr(callEarningsLifetime);
    callEarningsToday = roundInr(callEarningsToday);
    callEarningsThisWeek = roundInr(callEarningsThisWeek);

    const totalEarningsLifetime = roundInr(callEarningsLifetime + chatEarningsLifetime);
    const totalEarningsToday = roundInr(callEarningsToday + chatToday);
    const totalEarningsThisWeek = roundInr(callEarningsThisWeek + chatEarningsThisWeek);

    recentCandidates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const topRecent = recentCandidates.slice(0, 20);

    const referralCredits = await ReceiverWalletCredit.find({
      receiverId: rid,
      source: 'referral_reward',
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('amountInr description createdAt')
      .lean<{ _id: mongoose.Types.ObjectId; amountInr: number; description: string; createdAt: Date }[]>();

    const userIds = [...new Set(topRecent.map((r) => r.userId).filter(Boolean))];
    const callers =
      userIds.length > 0
        ? await User.find({ _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) } })
            .select('name')
            .lean()
        : [];
    const nameById = new Map(callers.map((u) => [String(u._id), String(u.name ?? 'Caller')]));

    const recent = [
      ...topRecent.map((r) => ({
        id: r.id,
        title: 'Chat message',
        subtitle: `From ${nameById.get(r.userId) ?? 'Caller'}`,
        amountInr: roundInr(r.amountInr),
        createdAt: r.createdAt.toISOString(),
      })),
      ...referralCredits.map((row) => ({
        id: `referral-${String(row._id)}`,
        title: 'Referral reward',
        subtitle: row.description,
        amountInr: roundInr(row.amountInr),
        createdAt: row.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);

    const receiverWelcome = await getReceiverWelcomeSettings();

    res.status(200).json({
      walletBalance,
      chatToday,
      chatThisMonth,
      chatEarningsLifetime,
      chatEarningsThisWeek,
      callEarningsLifetime,
      callEarningsToday,
      callEarningsThisWeek,
      totalEarningsLifetime,
      totalEarningsToday,
      totalEarningsThisWeek,
      recent,
      receiverWelcome,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getReceiverWalletSummary error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /profile/withdrawals/overview — receiver withdrawal card + history.
 */
export const getReceiverWithdrawalOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'Only receivers can view withdrawals' });
      return;
    }
    if (blockReceiverUntilApproved(req, res)) return;

    const rid = String(req.receiver!._id);
    const receiver = await Receiver.findById(rid).select(
      'walletBalance phone nameAsPerAadhaar upiId aadhaarNumber panNumber'
    );
    if (!receiver) {
      res.status(404).json({ message: 'Receiver not found' });
      return;
    }

    const recentRows = await WithdrawalRequest.find({
      receiverId: rid,
      status: { $in: ['pending', 'approved', 'rejected'] },
    })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('amount status createdAt payoutStatus payoutUtr')
      .lean<{
        _id: mongoose.Types.ObjectId;
        amount: number;
        status: string;
        payoutStatus?: string;
        payoutUtr?: string | null;
        createdAt: Date;
      }[]>();

    const withdrawable = await computeReceiverWithdrawableSnapshot(
      rid,
      typeof receiver.walletBalance === 'number' && Number.isFinite(receiver.walletBalance)
        ? receiver.walletBalance
        : 0
    );

    res.status(200).json({
      walletBalance: withdrawable.withdrawableBalance,
      pendingAmount: withdrawable.pendingAmount,
      totalEarnings: withdrawable.totalEarnings,
      totalWithdrawn: withdrawable.totalWithdrawn,
      payment: {
        nameAsPerAadhaar: receiver.nameAsPerAadhaar ?? '',
        upiMasked: receiver.upiId ? maskUpiId(receiver.upiId) : '',
        complete: receiverPaymentDetailsComplete(receiver),
      },
      bank: {
        bankName: 'UPI',
        accountHolderName: receiver.nameAsPerAadhaar ?? '',
        accountMasked: receiver.upiId ? maskUpiId(receiver.upiId) : '',
      },
      phoneMasked: receiver.phone ? maskPhone(receiver.phone) : '',
      recent: recentRows.map((row) => ({
        id: String(row._id),
        amount: roundInr(row.amount),
        status: row.status,
        payoutStatus: row.payoutStatus && row.payoutStatus !== 'none' ? row.payoutStatus : undefined,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getReceiverWithdrawalOverview error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /profile/withdrawals/send-otp — body `{ amount }`.
 */
export const sendReceiverWithdrawalOtp = async (
  req: Request<{}, {}, { amount?: unknown }>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'Only receivers can request withdrawals' });
      return;
    }
    if (blockReceiverUntilApproved(req, res)) return;

    const amount = toInrAmount(req.body.amount);
    if (amount === null) {
      res.status(400).json({ message: 'amount must be at least 1 INR' });
      return;
    }

    const rid = String(req.receiver!._id);
    const receiver = await Receiver.findById(rid).select(
      'phone walletBalance nameAsPerAadhaar upiId aadhaarNumber panNumber'
    );
    if (!receiver) {
      res.status(404).json({ message: 'Receiver not found' });
      return;
    }
    const withdrawable = await computeReceiverWithdrawableSnapshot(rid, receiver.walletBalance ?? 0);
    if (amount > withdrawable.withdrawableBalance) {
      res.status(400).json({ message: 'Insufficient wallet balance' });
      return;
    }
    if (!receiverPaymentDetailsComplete(receiver)) {
      res.status(400).json({ message: 'Please complete payment details before requesting a withdrawal' });
      return;
    }

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await WithdrawalRequest.findOneAndUpdate(
      { receiverId: rid, status: 'verification_pending' },
      {
        $set: {
          amount,
          status: 'verification_pending',
          verificationCodeHash: otpHash(code),
          verificationExpiresAt: expiresAt,
          verifiedAt: null,
          reviewedAt: null,
          reviewedByAdminId: null,
          adminNote: null,
          bankName: 'UPI',
          accountHolderName: receiver.nameAsPerAadhaar ?? '',
          accountMasked: maskUpiId(receiver.upiId ?? ''),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (!receiver.phone?.trim()) {
      res.status(400).json({ message: 'Mobile number is required for OTP verification' });
      return;
    }
    logReceiverMobileOtp('withdrawal', receiver.phone, code);

    res.status(200).json({
      message: 'OTP sent to your mobile number',
      phoneMasked: maskPhone(receiver.phone),
      expiresInSec: 300,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('sendReceiverWithdrawalOtp error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /profile/withdrawals/verify — body `{ otp }`.
 */
export const verifyReceiverWithdrawalOtpAndCreate = async (
  req: Request<{}, {}, { otp?: string }>,
  res: Response
): Promise<void> => {
  try {
    const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'Only receivers can request withdrawals' });
      return;
    }
    if (blockReceiverUntilApproved(req, res)) return;

    const otp = String(req.body.otp ?? '').trim();
    if (!/^\d{6}$/.test(otp)) {
      res.status(400).json({ message: 'Enter a valid 6-digit OTP' });
      return;
    }

    const rid = String(req.receiver!._id);
    const [receiver, pendingVerification] = await Promise.all([
      Receiver.findById(rid).select('walletBalance'),
      WithdrawalRequest.findOne({ receiverId: rid, status: 'verification_pending' }),
    ]);
    if (!receiver) {
      res.status(404).json({ message: 'Receiver not found' });
      return;
    }
    if (!pendingVerification) {
      res.status(400).json({ message: 'Please request OTP again' });
      return;
    }

    if (
      !pendingVerification.verificationCodeHash ||
      !pendingVerification.verificationExpiresAt ||
      pendingVerification.verificationExpiresAt.getTime() < Date.now()
    ) {
      await WithdrawalRequest.deleteOne({ _id: pendingVerification._id });
      res.status(400).json({ message: 'OTP expired. Please request again' });
      return;
    }

    const localBypass = /^\d{6}$/.test(otp);
    if (!otpBypass && !localBypass && otpHash(otp) !== pendingVerification.verificationCodeHash) {
      res.status(400).json({ message: 'Incorrect OTP' });
      return;
    }

    const withdrawable = await computeReceiverWithdrawableSnapshot(rid, receiver.walletBalance ?? 0);
    if (pendingVerification.amount > withdrawable.withdrawableBalance) {
      res.status(400).json({ message: 'Insufficient wallet balance. Please reduce amount and retry' });
      return;
    }

    pendingVerification.status = 'pending';
    pendingVerification.verifiedAt = new Date();
    pendingVerification.verificationCodeHash = null;
    pendingVerification.verificationExpiresAt = null;
    pendingVerification.payoutStatus = 'processing';
    pendingVerification.payoutId = null;
    pendingVerification.payoutUtr = null;
    pendingVerification.payoutError = null;
    pendingVerification.walletDebitedAt = null;
    pendingVerification.walletRefundedAt = null;
    pendingVerification.payoutReferenceId = `wd_${String(pendingVerification._id).slice(-10)}`;
    await pendingVerification.save();

    emitReceiverWithdrawalUpdate(rid, {
      withdrawalId: String(pendingVerification._id),
      amount: roundInr(pendingVerification.amount),
      payoutStatus: 'processing',
      message: 'Please wait, payment is processing',
    });

    void trackAndFinalizeRazorpayXPayout(String(pendingVerification._id)).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('auto payout tracker error:', msg);
    });

    res.status(200).json({
      message: 'Please wait, payment is processing',
      withdrawal: {
        id: String(pendingVerification._id),
        amount: roundInr(pendingVerification.amount),
        status: pendingVerification.status,
        payoutStatus: pendingVerification.payoutStatus,
        createdAt: pendingVerification.createdAt.toISOString(),
      },
      walletBalance: withdrawable.withdrawableBalance,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('verifyReceiverWithdrawalOtpAndCreate error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /profile/receiver-call-insights — receiver dashboard call stats, recent calls, caller-wise history.
 */
export const getReceiverCallInsights = async (
  req: Request<{}, {}, {}, { range?: string }>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'Only receivers can access call insights' });
      return;
    }
    if (blockReceiverUntilApproved(req, res)) return;

    const rid = new mongoose.Types.ObjectId(String(req.receiver!._id));
    const range = String(req.query.range ?? 'all').toLowerCase();
    const now = new Date();
    const receiverMeta = await Receiver.findById(rid)
      .select('cumulativeScore badgeLevel earningRatePerMinute isOnline onlineSince')
      .lean<{
        cumulativeScore?: number;
        badgeLevel?: 'platinum' | 'diamond' | 'supreme';
        earningRatePerMinute?: number;
        isOnline?: boolean;
        onlineSince?: Date | null;
      } | null>();
    const liveOnlineScore =
      receiverMeta?.isOnline && receiverMeta.onlineSince instanceof Date
        ? computeLiveOnlineScore(receiverMeta.onlineSince, now)
        : 0;
    const persistedScore =
      typeof receiverMeta?.cumulativeScore === 'number' && Number.isFinite(receiverMeta.cumulativeScore)
        ? roundInr(receiverMeta.cumulativeScore)
        : 0;
    const effectiveTotalScore = roundInr(persistedScore + liveOnlineScore);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const completed = await CallSession.find({
      receiverId: rid,
      status: 'completed',
      receiverHiddenAt: null,
    })
      .sort({ startedAt: -1 })
      .lean<
        {
          _id: mongoose.Types.ObjectId;
          callerId: mongoose.Types.ObjectId;
          startedAt: Date;
          durationSec: number;
          ratePerMinute: number;
          receiverPayoutRatePerMinute?: number;
          settledAmountInr?: number;
          receiverEarnedInr?: number;
          callerRating?: number | null;
        }[]
      >();

    const safeDur = (row: { durationSec: number }): number =>
      Math.max(0, Math.floor(Number(row.durationSec) || 0));

    const completedValid = completed.filter((row) => safeDur(row) >= MISSED_OR_INCOMPLETE_MAX_SEC);
    const missedOrIncomplete = completed.filter((row) => safeDur(row) < MISSED_OR_INCOMPLETE_MAX_SEC);

    const callerIds = [
      ...new Set([
        ...completedValid.map((c) => String(c.callerId)),
        ...missedOrIncomplete.map((c) => String(c.callerId)),
      ]),
    ];
    const callers =
      callerIds.length === 0
        ? []
        : await User.find({ _id: { $in: callerIds.map((id) => new mongoose.Types.ObjectId(id)) } })
            .select('_id name profileImage')
            .lean<{ _id: mongoose.Types.ObjectId; name: string; profileImage?: string | null }[]>();
    const callerById = new Map(
      callers.map((c) => [String(c._id), { name: c.name, profileImage: c.profileImage ?? null }])
    );

    const totalDurationSec = completedValid.reduce((sum, row) => sum + safeDur(row), 0);
    const weekDurationSec = completedValid
      .filter((row) => row.startedAt >= weekStart)
      .reduce((sum, row) => sum + safeDur(row), 0);
    const monthDurationSec = completedValid
      .filter((row) => row.startedAt >= monthStart)
      .reduce((sum, row) => sum + safeDur(row), 0);

    const filteredValid = completedValid.filter((row) => {
      if (range === 'week') return row.startedAt >= weekStart;
      if (range === 'month') return row.startedAt >= monthStart;
      return true;
    });

    const filteredMissed = missedOrIncomplete.filter((row) => {
      if (range === 'week') return row.startedAt >= weekStart;
      if (range === 'month') return row.startedAt >= monthStart;
      return true;
    });

    const recentCalls = filteredValid.slice(0, 20).map((row) => ({
      id: String(row._id),
      callerId: String(row.callerId),
      callerName: callerById.get(String(row.callerId))?.name ?? 'Caller',
      callerImage: callerById.get(String(row.callerId))?.profileImage ?? null,
      startedAt: row.startedAt.toISOString(),
      durationSec: safeDur(row),
      earningInr: roundInr(
        typeof row.receiverEarnedInr === 'number' && Number.isFinite(row.receiverEarnedInr)
          ? row.receiverEarnedInr
          : (safeDur(row) / 60) *
              (typeof row.receiverPayoutRatePerMinute === 'number' &&
              Number.isFinite(row.receiverPayoutRatePerMinute)
                ? row.receiverPayoutRatePerMinute
                : 0)
      ),
      rating: typeof row.callerRating === 'number' ? row.callerRating : null,
    }));

    type MissedAgg = {
      callerId: string;
      callerName: string;
      callerImage: string | null;
      missedCount: number;
      lastAt: Date;
      lastDurationSec: number;
      sessionIds: string[];
    };
    type IncompleteAgg = {
      callerId: string;
      callerName: string;
      callerImage: string | null;
      incompleteCount: number;
      lastAt: Date;
      lastDurationSec: number;
      sessionIds: string[];
    };
    const missedByCaller = new Map<string, MissedAgg>();
    const incompleteByCaller = new Map<string, IncompleteAgg>();
    for (const row of filteredMissed) {
      const callerId = String(row.callerId);
      const dur = safeDur(row);
      if (dur <= 0) {
        const existing = missedByCaller.get(callerId);
        if (!existing) {
          missedByCaller.set(callerId, {
            callerId,
            callerName: callerById.get(callerId)?.name ?? 'Caller',
            callerImage: callerById.get(callerId)?.profileImage ?? null,
            missedCount: 1,
            lastAt: row.startedAt,
            lastDurationSec: dur,
            sessionIds: [String(row._id)],
          });
          continue;
        }
        existing.missedCount += 1;
        existing.sessionIds.push(String(row._id));
        if (row.startedAt >= existing.lastAt) {
          existing.lastAt = row.startedAt;
          existing.lastDurationSec = dur;
        }
        continue;
      }
      const existingIncomplete = incompleteByCaller.get(callerId);
      if (!existingIncomplete) {
        incompleteByCaller.set(callerId, {
          callerId,
          callerName: callerById.get(callerId)?.name ?? 'Caller',
          callerImage: callerById.get(callerId)?.profileImage ?? null,
          incompleteCount: 1,
          lastAt: row.startedAt,
          lastDurationSec: dur,
          sessionIds: [String(row._id)],
        });
        continue;
      }
      existingIncomplete.incompleteCount += 1;
      existingIncomplete.sessionIds.push(String(row._id));
      if (row.startedAt >= existingIncomplete.lastAt) {
        existingIncomplete.lastAt = row.startedAt;
        existingIncomplete.lastDurationSec = dur;
      }
    }
    const missedCallGroups = [...missedByCaller.values()]
      .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
      .map((row) => ({
        callerId: row.callerId,
        callerName: row.callerName,
        callerImage: row.callerImage,
        missedCount: row.missedCount,
        lastAt: row.lastAt.toISOString(),
        lastDurationSec: row.lastDurationSec,
        sessionIds: row.sessionIds,
      }));
    const incompleteCallGroups = [...incompleteByCaller.values()]
      .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
      .map((row) => ({
        callerId: row.callerId,
        callerName: row.callerName,
        callerImage: row.callerImage,
        incompleteCount: row.incompleteCount,
        lastAt: row.lastAt.toISOString(),
        lastDurationSec: row.lastDurationSec,
        sessionIds: row.sessionIds,
      }));

    type CallerAgg = {
      callerId: string;
      callerName: string;
      callsWeek: number;
      callsMonth: number;
      durationWeekSec: number;
      durationMonthSec: number;
      ratingSum: number;
      ratingCount: number;
    };
    const byCaller = new Map<string, CallerAgg>();
    for (const row of completedValid) {
      const callerId = String(row.callerId);
      if (!byCaller.has(callerId)) {
        byCaller.set(callerId, {
          callerId,
          callerName: callerById.get(callerId)?.name ?? 'Caller',
          callsWeek: 0,
          callsMonth: 0,
          durationWeekSec: 0,
          durationMonthSec: 0,
          ratingSum: 0,
          ratingCount: 0,
        });
      }
      const agg = byCaller.get(callerId)!;
      const d = safeDur(row);
      if (row.startedAt >= weekStart) {
        agg.callsWeek += 1;
        agg.durationWeekSec += d;
      }
      if (row.startedAt >= monthStart) {
        agg.callsMonth += 1;
        agg.durationMonthSec += d;
      }
      if (typeof row.callerRating === 'number') {
        agg.ratingSum += row.callerRating;
        agg.ratingCount += 1;
      }
    }

    const callerHistory = [...byCaller.values()]
      .sort((a, b) => b.durationMonthSec - a.durationMonthSec)
      .map((row) => ({
        callerId: row.callerId,
        callerName: row.callerName,
        callsWeek: row.callsWeek,
        callsMonth: row.callsMonth,
        durationWeekSec: row.durationWeekSec,
        durationMonthSec: row.durationMonthSec,
        avgRating: row.ratingCount > 0 ? roundInr(row.ratingSum / row.ratingCount) : null,
      }));

    const [earningSettings, receiverWelcome] = await Promise.all([
      getReceiverEarningSettings(),
      getReceiverWelcomeSettings(),
    ]);
    const earningPublic = publicEarningSchedulePayload(earningSettings);
    const scoreBasedRate =
      typeof receiverMeta?.earningRatePerMinute === 'number' &&
      Number.isFinite(receiverMeta.earningRatePerMinute)
        ? roundInr(receiverMeta.earningRatePerMinute)
        : 2.0;

    const [ratingSummary] = await ReceiverRating.aggregate<{ avg: number; count: number }>([
      { $match: { receiverId: rid } },
      {
        $group: {
          _id: null,
          avg: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, avg: 1, count: 1 } },
    ]);

    const secToLeaderboardMinutes = (sec: number): number =>
      Math.max(0, Math.round(Math.max(0, sec) / 60));

    res.status(200).json({
      leaderboard: {
        totalDurationSec,
        totalMinutes: secToLeaderboardMinutes(totalDurationSec),
        thisWeekDurationSec: weekDurationSec,
        thisWeekMinutes: secToLeaderboardMinutes(weekDurationSec),
        thisMonthDurationSec: monthDurationSec,
        thisMonthMinutes: secToLeaderboardMinutes(monthDurationSec),
      },
      recentCalls,
      missedCallGroups,
      incompleteCallGroups,
      callerHistory,
      receiverRatingAvg:
        ratingSummary && Number.isFinite(ratingSummary.avg) ? roundInr(ratingSummary.avg) : 0,
      receiverRatingCount: ratingSummary?.count ?? 0,
      totalScore: effectiveTotalScore,
      liveOnlineScore,
      badgeLevel: receiverMeta?.badgeLevel ?? 'platinum',
      receiverEarningModel: earningPublic.receiverEarningModel,
      earningRatePerMinute:
        earningPublic.receiverEarningModel === 'fixed_per_minute'
          ? earningPublic.earningRatePerMinute
          : scoreBasedRate,
      fixedPerMinuteWindows:
        earningPublic.receiverEarningModel === 'fixed_per_minute'
          ? earningPublic.fixedPerMinuteWindows
          : undefined,
      earningTimezone: earningPublic.timezone,
      receiverWelcome,
      scoreRules:
        earningPublic.receiverEarningModel === 'fixed_per_minute'
          ? undefined
          : {
        call: {
          ignoreAtOrBelowSeconds: MISSED_OR_INCOMPLETE_MAX_SEC,
          midBand: { minMinutes: 3, maxMinutesExclusive: 10, multiplier: 3 },
          topBand: { minMinutes: 10, multiplier: 5 },
        },
        online: {
          timezone: 'Asia/Kolkata',
          windows: [
            { from: '09:00', to: '21:00', multiplier: 0.5 },
            { from: '22:00', to: '24:00', multiplier: 3 },
            { from: '00:00', to: '02:00', multiplier: 10 },
          ],
        },
        weekendTargets: {
          weekday: { supremeAt: 12000, diamondAt: 8000 },
          weekend: { supremeAt: 13000, diamondAt: 9000 },
          note: 'Targets can be adjusted on weekends due to demand.',
        },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getReceiverCallInsights error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /profile/receiver-welcome — admin-managed welcome card for receiver home.
 */
export const getReceiverWelcomeMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'Only receivers can access welcome message' });
      return;
    }
    if (blockReceiverUntilApproved(req, res)) return;

    const receiverWelcome = await getReceiverWelcomeSettings();
    res.status(200).json({ receiverWelcome });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getReceiverWelcomeMessage error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /profile/caller-notification — admin announcement card on caller discover home.
 */
export const getCallerNotificationMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.accountKind !== 'user') {
      res.status(403).json({ message: 'Only callers can view this notification' });
      return;
    }

    const callerNotification = await getCallerNotificationSettings();
    res.status(200).json({ callerNotification });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getCallerNotificationMessage error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /profile/receiver-notify-candidates — latest 20 unique recent callers for manual ping.
 */
export const getReceiverNotifyCandidates = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'Only receivers can view notify users list' });
      return;
    }
    if (blockReceiverUntilApproved(req, res)) return;

    const receiverId = new mongoose.Types.ObjectId(String(req.receiver!._id));
    const rows = await CallSession.find({
      receiverId,
      status: 'completed',
    })
      .sort({ startedAt: -1 })
      .limit(250)
      .select('callerId startedAt')
      .lean<{ callerId: mongoose.Types.ObjectId; startedAt: Date }[]>();

    const seen = new Set<string>();
    const orderedCallerIds: string[] = [];
    const lastCallAtByCaller = new Map<string, Date>();
    for (const row of rows) {
      const cid = String(row.callerId);
      if (seen.has(cid)) continue;
      seen.add(cid);
      orderedCallerIds.push(cid);
      lastCallAtByCaller.set(cid, row.startedAt);
      if (orderedCallerIds.length >= 20) break;
    }

    if (orderedCallerIds.length === 0) {
      res.status(200).json({ users: [] });
      return;
    }

    const users = await User.find({
      _id: { $in: orderedCallerIds.map((id) => new mongoose.Types.ObjectId(id)) },
      accountStatus: 'approved',
      suspended: { $ne: true },
    })
      .select('_id name profileImage')
      .lean<{ _id: mongoose.Types.ObjectId; name: string; profileImage?: string | null }[]>();
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const candidates = orderedCallerIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((u) => ({
        userId: String(u!._id),
        name: u!.name || 'User',
        profileImage: u!.profileImage ?? null,
        lastCallAt: (lastCallAtByCaller.get(String(u!._id)) ?? new Date()).toISOString(),
      }));

    res.status(200).json({ users: candidates });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getReceiverNotifyCandidates error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

const RECEIVER_NOTIFY_COOLDOWN_MS = 8 * 60 * 60 * 1000;
const RECEIVER_NOTIFY_PRIORITY_MS = 12 * 60 * 60 * 1000;
type ReceiverNotifyUserBody = { userId?: string };

/**
 * POST /profile/receiver-notify-user — send manual availability ping to one recent caller.
 */
export const notifyReceiverRecentUser = async (
  req: Request<{}, {}, ReceiverNotifyUserBody>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'Only receivers can notify users' });
      return;
    }
    if (blockReceiverUntilApproved(req, res)) return;

    const receiverId = String(req.receiver!._id);
    const receiver = await Receiver.findById(receiverId).select(
      'name accountStatus suspended isOnline isAvailable'
    );
    if (!receiver || receiver.accountStatus !== 'approved' || receiver.suspended) {
      res.status(403).json({ message: 'Receiver account is not allowed for this action' });
      return;
    }
    if (!receiver.isAvailable || !isReceiverSocketConnected(receiverId)) {
      res.status(409).json({ message: 'You can notify users only when online and available.' });
      return;
    }

    const userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : '';
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ message: 'Valid userId is required' });
      return;
    }
    const uid = new mongoose.Types.ObjectId(userId);

    const recentLink = await CallSession.exists({
      receiverId: new mongoose.Types.ObjectId(receiverId),
      callerId: uid,
      status: 'completed',
    });
    if (!recentLink) {
      res.status(403).json({ message: 'You can notify only users from your recent call history.' });
      return;
    }

    const targetUser = await User.findById(uid).select('accountStatus suspended');
    if (!targetUser || targetUser.accountStatus !== 'approved' || targetUser.suspended) {
      res.status(404).json({ message: 'User not found or unavailable.' });
      return;
    }

    const cooldownSince = new Date(Date.now() - RECEIVER_NOTIFY_COOLDOWN_MS);
    const recentlyNotified = await ReceiverPriorityNotification.findOne({
      receiverId: new mongoose.Types.ObjectId(receiverId),
      userId: uid,
      lastNotifiedAt: { $gte: cooldownSince },
    }).select('_id');
    if (recentlyNotified) {
      res.status(429).json({ message: 'User already notified recently. Please wait before notifying again.' });
      return;
    }

    const now = new Date();
    await ReceiverPriorityNotification.findOneAndUpdate(
      {
        receiverId: new mongoose.Types.ObjectId(receiverId),
        userId: uid,
      },
      {
        $set: {
          lastNotifiedAt: now,
          priorityUntil: new Date(now.getTime() + RECEIVER_NOTIFY_PRIORITY_MS),
        },
      },
      { upsert: true, new: true }
    );

    const receiverName = receiver.name?.trim() || 'Receiver';
    await ReceiverAvailabilityNotification.create({
      userId: uid,
      receiverIds: [new mongoose.Types.ObjectId(receiverId)],
      title: `${receiverName} is available to talk now.`,
      subtitle: 'Open app and call now while she is available.',
    });

    res.status(200).json({ message: 'Notification sent successfully.' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('notifyReceiverRecentUser error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * PATCH /profile/receiver — approved receivers can update editable profile fields.
 */
export const updateReceiverProfile = async (
  req: Request<{}, {}, UpdateReceiverBody>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'This endpoint is only for receiver accounts' });
      return;
    }
    if (blockReceiverUntilApproved(req, res)) return;

    const receiverId = String(req.receiver!._id);
    const receiver = await Receiver.findById(receiverId);
    if (!receiver) {
      res.status(404).json({ message: 'Receiver not found' });
      return;
    }
    const wasAvailable = Boolean(receiver.isAvailable);
    const wasOnline = Boolean(receiver.isOnline);

    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      receiver.name = req.body.name.trim();
    }
    if (typeof req.body.profileImage === 'string' && req.body.profileImage.trim()) {
      receiver.profileImage = req.body.profileImage.trim();
    }
    if (typeof req.body.state === 'string' && req.body.state.trim()) {
      receiver.state = req.body.state.trim();
    }
    if (typeof req.body.gender === 'string') {
      const g = req.body.gender.trim();
      if (g === 'male' || g === 'female' || g === 'other') {
        receiver.gender = g;
      }
    }
    if (typeof req.body.age === 'number' && Number.isFinite(req.body.age)) {
      const age = Math.round(req.body.age);
      if (age >= 18 && age <= 120) {
        receiver.age = age;
      }
    }
    if (Array.isArray(req.body.languages)) {
      receiver.languages = req.body.languages.map((x) => String(x).trim()).filter(Boolean);
    }
    if (Array.isArray(req.body.interests)) {
      receiver.interests = req.body.interests.map((x) => String(x).trim()).filter(Boolean);
    }
    if (typeof req.body.aadhaarNumber === 'string' && req.body.aadhaarNumber.trim()) {
      const aadhaarDigits = req.body.aadhaarNumber.replace(/\D/g, '').trim();
      if (!/^\d{12}$/.test(aadhaarDigits)) {
        res.status(400).json({ message: 'aadhaarNumber must be a valid 12-digit number' });
        return;
      }
      receiver.aadhaarNumber = aadhaarDigits;
    }
    if (typeof req.body.panNumber === 'string' && req.body.panNumber.trim()) {
      const pan = req.body.panNumber.trim().toUpperCase();
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
        res.status(400).json({ message: 'panNumber must be valid (e.g. ABCDE1234F)' });
        return;
      }
      receiver.panNumber = pan;
    }
    if (typeof req.body.aadhaarFront === 'string' && req.body.aadhaarFront.trim()) {
      receiver.aadhaarFront = req.body.aadhaarFront.trim();
    }
    if (typeof req.body.aadhaarBack === 'string' && req.body.aadhaarBack.trim()) {
      receiver.aadhaarBack = req.body.aadhaarBack.trim();
    }
    if (typeof req.body.panFront === 'string' && req.body.panFront.trim()) {
      receiver.panFront = req.body.panFront.trim();
    }
    if (receiver.aadhaarFront && receiver.aadhaarBack && receiver.panFront) {
      receiver.documents = [receiver.aadhaarFront, receiver.aadhaarBack, receiver.panFront];
    }
    if (typeof req.body.userAudio === 'string') {
      const rawAudio = req.body.userAudio.trim();
      if (rawAudio) {
        if (!/^https?:\/\//i.test(rawAudio)) {
          res.status(400).json({ message: 'userAudio must be a valid http(s) URL' });
          return;
        }
        receiver.userAudio = rawAudio;
      }
    }
    receiver.audioCallRate = RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN;
    if (typeof req.body.isAvailable === 'boolean') {
      receiver.isAvailable = req.body.isAvailable;
      if (!req.body.isAvailable) {
        clearReceiverDiscoverGrace(receiverId);
        const endedAt = new Date();
        const onlineSince = receiver.onlineSince;
        receiver.isOnline = false;
        receiver.onlineSince = null;
        if (onlineSince instanceof Date) {
          await finalizeReceiverOnlineSession({
            receiverId,
            onlineSince,
            endedAt,
          });
        }
      }
      // Go Online only sets isAvailable; isOnline is set when the receiver socket connects.
    }

    if (receiver.accountStatus === 'pending_profile') {
      const audioOk =
        Boolean(receiver.userAudio?.trim()) && /^https?:\/\//i.test(String(receiver.userAudio).trim());
      if (receiverOnboardingProfileFieldsComplete(receiver) && audioOk) {
        receiver.accountStatus = 'approved';
      }
    }

    await receiver.save();
    await syncReceiverPresenceInDatabase(receiverId);

    const becameCallAvailable =
      !wasAvailable &&
      Boolean(receiver.isAvailable) &&
      isReceiverSocketConnected(receiverId);
    if (becameCallAvailable) {
      void scheduleReceiverAvailabilityNotifications(receiverId).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('receiver availability notify error:', msg);
      });
    }

    res.status(200).json({
      message: 'Profile updated',
      user: toApiReceiver(receiver),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('updateReceiverProfile error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /profile/receiver/presence/background — keep discover online while app is minimized (OnePlus/Oppo).
 */
export const receiverBackgroundPresence = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'This endpoint is only for receiver accounts' });
      return;
    }
    const receiverId = String(req.receiver!._id);
    const result = await touchReceiverBackgroundPresence(receiverId);
    res.status(200).json({
      ok: result.ok,
      graceUntilMs: result.graceUntilMs,
      reason: result.reason ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('receiverBackgroundPresence error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /profile/receiver/presence/foreground — sync presence when app returns to foreground.
 */
export const receiverForegroundPresence = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'This endpoint is only for receiver accounts' });
      return;
    }
    const receiverId = String(req.receiver!._id);
    await touchReceiverForegroundPresence(receiverId);
    res.status(200).json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('receiverForegroundPresence error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * PATCH /profile/receiver/push-token — store Expo push token for incoming-call notifications.
 */
export const updateReceiverExpoPushToken = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'This endpoint is only for receiver accounts' });
      return;
    }
    const token =
      typeof req.body.expoPushToken === 'string' ? req.body.expoPushToken.trim() : '';
    if (!token || !token.startsWith('ExponentPushToken')) {
      res.status(400).json({ message: 'A valid expoPushToken is required' });
      return;
    }
    const receiverId = String(req.receiver!._id);
    await Receiver.updateOne({ _id: receiverId }, { $set: { expoPushToken: token } });
    res.status(200).json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('updateReceiverExpoPushToken error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /profile/receiver/complete-audio-onboarding
 * Saves voice URL (from body if provided), runs gender verification, then approves.
 */
export const completeReceiverAudioOnboarding = async (
  req: Request<{}, {}, CallerAudioPatchBody>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'This endpoint is only for receiver accounts' });
      return;
    }
    if (blockReceiverUntilApproved(req, res)) return;

    const receiverId = String(req.receiver!._id);
    const receiver = await Receiver.findById(receiverId);
    if (!receiver) {
      res.status(404).json({ message: 'Receiver not found' });
      return;
    }

    const bodyVoiceUrl = parseCallerAudioHttpsUrl(req.body);
    if (bodyVoiceUrl) {
      receiver.userAudio = bodyVoiceUrl;
    }

    const voiceUrl = String(receiver.userAudio ?? '').trim();
    if (!voiceUrl || !/^https?:\/\//i.test(voiceUrl)) {
      res.status(400).json({
        message: 'Record and upload your voice sample before continuing',
        error: 'RECEIVER_AUDIO_MISSING',
      });
      return;
    }

    const profileGender = receiver.gender;
    if (profileGender !== 'male' && profileGender !== 'female' && profileGender !== 'other') {
      res.status(400).json({
        message: 'Complete your profile gender before voice verification',
        error: 'RECEIVER_GENDER_MISSING',
      });
      return;
    }

    const receiverVoiceVerificationMode = readReceiverVoiceVerificationMode();
    let voiceVerification: CallerVoiceVerificationPayload;
    if (receiverVoiceVerificationMode === 'required') {
      console.log('[receiver-audio-onboarding] voice verification starting', {
        receiverId,
        profileGender,
        voiceUrl,
      });
      const verification = await verifyVoiceGender(voiceUrl, profileGender);
      console.log('[receiver-audio-onboarding] voice verification finished', {
        receiverId,
        ok: verification.ok,
        predictedGender: verification.predictedGender,
        confidence: verification.confidence,
        model: verification.model,
        failureKind: verification.failureKind,
      });
      voiceVerification = buildVoiceVerificationPayload(profileGender, verification);
      if (!verification.ok) {
        const failMessage =
          verification.failureKind === 'gender_mismatch'
            ? `Voice sounds like ${verification.predictedGender}, but your profile gender is ${profileGender}.`
            : verification.failureKind === 'low_confidence'
              ? `Voice check was unclear (confidence ${(verification.confidence * 100).toFixed(0)}%). Please record again in a quiet place.`
              : verification.failureKind === 'misconfigured'
                ? 'Voice verification is not configured on the server yet.'
                : verification.failureKind === 'audio_fetch_failed'
                  ? 'Could not download your voice sample for verification. Please record again.'
                  : verification.reason ||
                      'Voice verification service error. Please try again later.';
        console.log(
          '[receiver-audio-onboarding]',
          JSON.stringify(
            {
              receiverId,
              voiceUrl,
              profileGender,
              httpStatus: 422,
              message: failMessage,
              voiceVerification,
            },
            null,
            2
          )
        );
        res.status(422).json({
          message: failMessage,
          error: 'RECEIVER_VOICE_VERIFICATION_FAILED',
          voiceVerification,
        });
        return;
      }
    } else {
      voiceVerification = {
        provider: 'local',
        approved: true,
        predictedGender: profileGender,
        confidence: 1,
        threshold: 0,
        model: 'disabled',
        profileGender,
        reason: 'Receiver voice-gender verification skipped (RECEIVER_VOICE_GENDER_VERIFICATION_MODE=disabled)',
      };
    }

    const wasAvailable = Boolean(receiver.isAvailable);

    receiver.accountStatus = 'approved';
    await receiver.save();
    await syncReceiverPresenceInDatabase(receiverId);

    const becameCallAvailable =
      !wasAvailable &&
      Boolean(receiver.isAvailable) &&
      isReceiverSocketConnected(receiverId);
    if (becameCallAvailable) {
      void scheduleReceiverAvailabilityNotifications(receiverId).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('receiver availability notify error:', msg);
      });
    }

    console.log(
      '[receiver-audio-onboarding]',
      JSON.stringify(
        {
          receiverId,
          voiceUrl,
          profileGender,
          httpStatus: 200,
          message: 'Voice verified successfully',
          voiceVerification,
        },
        null,
        2
      )
    );
    res.status(200).json({
      message: 'Voice verified successfully',
      user: toApiReceiver(receiver),
      voiceVerification,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('completeReceiverAudioOnboarding error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /profile/receiver/reopen-kyc
 * Allows rejected receivers to re-enter the complete profile flow without logging out.
 */
export const reopenRejectedReceiverKyc = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'Only receivers can reopen KYC' });
      return;
    }
    const receiverId = String(req.receiver!._id);
    const receiver = await Receiver.findById(receiverId);
    if (!receiver) {
      res.status(404).json({ message: 'Receiver not found' });
      return;
    }
    if (receiver.accountStatus !== 'rejected') {
      res.status(400).json({ message: 'KYC can be reopened only from rejected status' });
      return;
    }
    receiver.accountStatus = 'pending_profile';
    receiver.rejectionReason = null;
    await receiver.save();
    res.status(200).json({
      message: 'KYC reopened',
      user: toApiReceiver(receiver),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('reopenRejectedReceiverKyc error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * DELETE /profile/receiver — deletes receiver account and related receiver-side data.
 */
export const deleteReceiverAccount = async (
  req: Request<{}, {}, { reason?: string }>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'This endpoint is only for receiver accounts' });
      return;
    }
    const receiverId = String(req.receiver!._id);
    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      res.status(400).json({ message: 'Invalid receiver id' });
      return;
    }
    const rid = new mongoose.Types.ObjectId(receiverId);

    // Soft logging for ops visibility.
    const reason = String(req.body.reason ?? '').trim();
    if (reason) {
      console.log(`[receiver-delete] receiver=${receiverId} reason="${reason}"`);
    }

    await Promise.all([
      ChatMessage.deleteMany({ receiverId: rid }),
      ChatBlock.deleteMany({ receiverId: rid }),
      WithdrawalRequest.deleteMany({ receiverId: rid }),
      CallSession.deleteMany({ receiverId: rid }),
      UserReport.deleteMany({
        $or: [
          { reporterKind: 'receiver', reporterId: rid },
          { reportedKind: 'receiver', reportedId: rid },
        ],
      }),
      Receiver.deleteOne({ _id: rid }),
    ]);

    res.status(200).json({ message: 'Account deleted' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('deleteReceiverAccount error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /profile/receiver/bank/send-otp — stage payment details and send OTP.
 */
export const sendReceiverBankUpdateOtp = async (
  req: Request<{}, {}, ReceiverBankUpdateBody>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'Only receivers can update payment details' });
      return;
    }
    if (blockReceiverUntilApproved(req, res)) return;

    const nameAsPerAadhaar = String(req.body.nameAsPerAadhaar ?? '').trim();
    const upiId = normalizeUpiId(req.body.upiId);
    if (!nameAsPerAadhaar) {
      res.status(400).json({ message: 'nameAsPerAadhaar is required' });
      return;
    }
    if (!upiId || !isValidUpiId(upiId)) {
      res.status(400).json({ message: 'Enter a valid UPI ID (e.g. name@bank)' });
      return;
    }

    const aadhaarDigits = String(req.body.aadhaarNumber ?? '').replace(/\D/g, '');
    const pan = String(req.body.panNumber ?? '').trim().toUpperCase();
    if (!/^\d{12}$/.test(aadhaarDigits)) {
      res.status(400).json({ message: 'Aadhaar number must be 12 digits' });
      return;
    }
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
      res.status(400).json({ message: 'Enter a valid PAN (e.g. ABCDE1234F)' });
      return;
    }

    const receiver = await Receiver.findById(String(req.receiver!._id)).select('phone');
    if (!receiver) {
      res.status(404).json({ message: 'Receiver not found' });
      return;
    }
    if (!receiver.phone?.trim()) {
      res.status(400).json({ message: 'Mobile number is required for OTP verification' });
      return;
    }

    const otpCode = generateOtpCode();
    receiver.otp = otpHash(otpCode);
    receiver.otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
    receiver.pendingNameAsPerAadhaar = nameAsPerAadhaar;
    receiver.pendingUpiId = upiId;
    receiver.pendingAadhaarNumber = aadhaarDigits;
    receiver.pendingPanNumber = pan;
    receiver.pendingAadhaarFront =
      typeof req.body.aadhaarFront === 'string' && req.body.aadhaarFront.trim()
        ? req.body.aadhaarFront.trim()
        : null;
    receiver.pendingAadhaarBack =
      typeof req.body.aadhaarBack === 'string' && req.body.aadhaarBack.trim()
        ? req.body.aadhaarBack.trim()
        : null;
    receiver.pendingPanFront =
      typeof req.body.panFront === 'string' && req.body.panFront.trim()
        ? req.body.panFront.trim()
        : null;
    await receiver.save();

    logReceiverMobileOtp('bank_update', receiver.phone, otpCode);
    res.status(200).json({
      message: 'OTP sent to your mobile number',
      phoneMasked: maskPhone(receiver.phone),
      expiresInSec: 300,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('sendReceiverBankUpdateOtp error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /profile/receiver/bank/verify — verify OTP and commit payment details.
 */
export const verifyReceiverBankUpdateOtp = async (
  req: Request<{}, {}, { otp?: string }>,
  res: Response
): Promise<void> => {
  try {
    const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'Only receivers can update payment details' });
      return;
    }
    if (blockReceiverUntilApproved(req, res)) return;

    const otp = String(req.body.otp ?? '').trim();
    if (!/^\d{6}$/.test(otp)) {
      res.status(400).json({ message: 'Enter a valid 6-digit OTP' });
      return;
    }

    const receiver = await Receiver.findById(String(req.receiver!._id));
    if (!receiver) {
      res.status(404).json({ message: 'Receiver not found' });
      return;
    }
    if (!receiver.otp || !receiver.otpExpiry || receiver.otpExpiry.getTime() < Date.now()) {
      res.status(400).json({ message: 'OTP expired. Request a new code' });
      return;
    }
    const localBypass = /^\d{6}$/.test(otp);
    if (!otpBypass && !localBypass && otpHash(otp) !== receiver.otp) {
      res.status(400).json({ message: 'Incorrect OTP' });
      return;
    }
    if (
      !receiver.pendingNameAsPerAadhaar ||
      !receiver.pendingUpiId ||
      !receiver.pendingAadhaarNumber ||
      !receiver.pendingPanNumber
    ) {
      res.status(400).json({ message: 'No pending payment details found. Start again' });
      return;
    }

    receiver.nameAsPerAadhaar = receiver.pendingNameAsPerAadhaar;
    receiver.upiId = receiver.pendingUpiId;
    receiver.aadhaarNumber = receiver.pendingAadhaarNumber;
    receiver.panNumber = receiver.pendingPanNumber;
    if (receiver.pendingAadhaarFront) receiver.aadhaarFront = receiver.pendingAadhaarFront;
    if (receiver.pendingAadhaarBack) receiver.aadhaarBack = receiver.pendingAadhaarBack;
    if (receiver.pendingPanFront) receiver.panFront = receiver.pendingPanFront;

    receiver.pendingNameAsPerAadhaar = null;
    receiver.pendingUpiId = null;
    receiver.pendingAadhaarNumber = null;
    receiver.pendingPanNumber = null;
    receiver.pendingAadhaarFront = null;
    receiver.pendingAadhaarBack = null;
    receiver.pendingPanFront = null;
    receiver.otp = null;
    receiver.otpExpiry = null;
    await receiver.save();

    res.status(200).json({
      message: 'payment details updated',
      user: toApiReceiver(receiver),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('verifyReceiverBankUpdateOtp error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/** Build paid chat earning rows using the same rules as wallet summary (incl. legacy messages). */
function buildReceiverChatEarningRows(
  allMessages: MsgLean[],
  minDate: Date | null
): {
  rows: {
    id: string;
    type: 'chat';
    title: string;
    createdAt: string;
    durationMin: number;
    grossAmount: number;
    platformFee: number;
    netEarning: number;
    status: 'completed';
  }[];
  total: number;
} {
  const byUser = new Map<string, MsgLean[]>();
  for (const m of allMessages) {
    const k = String(m.userId);
    if (!byUser.has(k)) byUser.set(k, []);
    byUser.get(k)!.push(m);
  }

  const rows: {
    id: string;
    type: 'chat';
    title: string;
    createdAt: string;
    durationMin: number;
    grossAmount: number;
    platformFee: number;
    netEarning: number;
    status: 'completed';
  }[] = [];
  let total = 0;

  for (const list of byUser.values()) {
    let receiverHasReplied = false;
    for (const m of list) {
      if (m.senderType === 'r') {
        receiverHasReplied = true;
        continue;
      }
      const t = msgTime(m);
      if (minDate && t < minDate) continue;
      const earned = effectiveCallerFeeInr(m, receiverHasReplied);
      if (earned <= 0) continue;
      total += earned;
      rows.push({
        id: `chat-${String(m._id)}`,
        type: 'chat',
        title: 'Chat Message',
        createdAt: t.toISOString(),
        durationMin: 0,
        grossAmount: earned,
        platformFee: 0,
        netEarning: earned,
        status: 'completed',
      });
    }
  }

  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { rows, total: roundInr(total) };
}

/**
 * GET /profile/receiver-earnings-breakdown — earnings cards, list, analytics (calls + chat).
 */
export const getReceiverEarningsBreakdown = async (
  req: Request<{}, {}, {}, { range?: string }>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'Only receivers can view earnings' });
      return;
    }
    if (blockReceiverUntilApproved(req, res)) return;

    const rid = new mongoose.Types.ObjectId(String(req.receiver!._id));
    const range = String(req.query.range ?? 'week').toLowerCase();

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const minDate = range === 'all' ? null : range === 'month' ? monthStart : weekStart;

    const [calls, allChatMessages] = await Promise.all([
      CallSession.find({
        receiverId: rid,
        status: 'completed',
        durationSec: { $gt: 0 },
        ...(minDate ? { startedAt: { $gte: minDate } } : {}),
      })
        .sort({ startedAt: -1 })
        .lean<
          {
            _id: mongoose.Types.ObjectId;
            startedAt: Date;
            durationSec: number;
            ratePerMinute: number;
            receiverPayoutRatePerMinute?: number;
            settledAmountInr?: number;
            receiverEarnedInr?: number;
          }[]
        >(),
      ChatMessage.find({ receiverId: rid })
        .sort({ createdAt: 1 })
        .select('userId senderType feeInr createdAt')
        .lean<MsgLean[]>(),
    ]);

    const callRows = calls.map((c) => {
      const earned = effectiveCallReceiverEarnedInr(c);
      return {
        id: `call-${String(c._id)}`,
        type: 'call' as const,
        title: 'Voice Call',
        createdAt: c.startedAt.toISOString(),
        durationMin: roundInr(c.durationSec / 60),
        grossAmount: earned,
        platformFee: 0,
        netEarning: earned,
        status: 'completed' as const,
      };
    });

    const { rows: chatRows, total: chatEarnings } = buildReceiverChatEarningRows(allChatMessages, minDate);

    const entries = [...callRows, ...chatRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const totalMinutes = roundInr(callRows.reduce((sum, r) => sum + r.durationMin, 0));
    const callEarnings = roundInr(callRows.reduce((sum, r) => sum + r.netEarning, 0));
    const netEarnings = roundInr(callEarnings + chatEarnings);
    const totalCalls = callRows.length;
    const avgCallMinutes = totalCalls > 0 ? roundInr(totalMinutes / totalCalls) : 0;

    const allCallsForLifetime = minDate
      ? await CallSession.find({
          receiverId: rid,
          status: 'completed',
          durationSec: { $gt: 0 },
        })
          .select('durationSec receiverEarnedInr receiverPayoutRatePerMinute')
          .lean<
            {
              durationSec: number;
              receiverEarnedInr?: number;
              receiverPayoutRatePerMinute?: number;
            }[]
          >()
      : calls;
    const lifetimeCallEarnings = roundInr(
      allCallsForLifetime.reduce((sum, row) => sum + effectiveCallReceiverEarnedInr(row), 0)
    );
    const lifetimeChatEarnings = minDate
      ? buildReceiverChatEarningRows(allChatMessages, null).total
      : chatEarnings;
    const lifetimeTotalEarnings = roundInr(lifetimeCallEarnings + lifetimeChatEarnings);

    function analyticsFor(mode: 'week' | 'month' | 'all') {
      const baseDate = mode === 'all' ? null : mode === 'month' ? monthStart : weekStart;
      const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const dayBuckets = new Map<number, { amount: number; sessions: number }>();
      for (let i = 0; i < 7; i += 1) dayBuckets.set(i, { amount: 0, sessions: 0 });

      for (const r of entries) {
        const d = new Date(r.createdAt);
        if (baseDate && d < baseDate) continue;
        const idx = (d.getDay() + 6) % 7; // Monday=0
        const b = dayBuckets.get(idx)!;
        b.amount += r.netEarning;
        b.sessions += 1;
      }
      return labels.map((label, idx) => ({
        label,
        amount: roundInr(dayBuckets.get(idx)!.amount),
        sessions: dayBuckets.get(idx)!.sessions,
      }));
    }

    res.status(200).json({
      stats: {
        totalCalls,
        avgCallMinutes,
        totalMinutes,
        grossEarnings: netEarnings,
        platformFee: 0,
        netEarnings,
        callEarnings,
        chatEarnings,
      },
      lifetime: {
        callEarnings: lifetimeCallEarnings,
        chatEarnings: lifetimeChatEarnings,
        totalEarnings: lifetimeTotalEarnings,
      },
      entries: entries.slice(0, 80),
      analytics: {
        week: analyticsFor('week'),
        month: analyticsFor('month'),
        all: analyticsFor('all'),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getReceiverEarningsBreakdown error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /profile/caller-call-history — caller call tab list.
 */
export const getCallerCallHistory = async (
  req: Request<{}, {}, {}, { range?: string }>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'user') {
      res.status(403).json({ message: 'Only callers can view call history' });
      return;
    }
    const authUser = req.user as UserDocument | undefined;
    if (!authUser?._id) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const range = String(req.query.range ?? 'all').toLowerCase();
    const uid = new mongoose.Types.ObjectId(String(authUser._id));
    const now = new Date();
    const start = new Date(now);
    if (range === 'week') start.setDate(now.getDate() - 7);
    else if (range === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    }

    const filter: Record<string, unknown> = {
      callerId: uid,
      status: 'completed',
      callerHiddenAt: null,
    };
    if (range !== 'all') filter.startedAt = { $gte: start };

    const rows = await CallSession.find(filter)
      .sort({ startedAt: -1 })
      .limit(100)
      .lean<
        {
          _id: mongoose.Types.ObjectId;
          receiverId: mongoose.Types.ObjectId;
          startedAt: Date;
          durationSec: number;
        }[]
      >();
    const receiverIds = [...new Set(rows.map((r) => String(r.receiverId)))];
    const receivers =
      receiverIds.length === 0
        ? []
        : await Receiver.find({ _id: { $in: receiverIds.map((id) => new mongoose.Types.ObjectId(id)) } })
            .select('_id name profileImage')
            .lean<{ _id: mongoose.Types.ObjectId; name: string; profileImage?: string | null }[]>();
    const byReceiver = new Map(receivers.map((r) => [String(r._id), r]));

    const statusFor = (durationSec: number): 'completed' | 'missed' | 'incomplete' => {
      const d = Math.max(0, Math.floor(Number(durationSec) || 0));
      if (d <= 0) return 'missed';
      if (d < MISSED_OR_INCOMPLETE_MAX_SEC) return 'incomplete';
      return 'completed';
    };

    res.status(200).json({
      calls: rows.map((r) => ({
        id: String(r._id),
        receiverId: String(r.receiverId),
        receiverName: byReceiver.get(String(r.receiverId))?.name ?? 'Receiver',
        receiverImage: byReceiver.get(String(r.receiverId))?.profileImage ?? null,
        durationSec: r.durationSec,
        startedAt: r.startedAt.toISOString(),
        status: statusFor(r.durationSec),
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getCallerCallHistory error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /profile/caller-call-history/delete — hide selected rows from caller Recents.
 */
export const deleteCallerCallHistory = async (
  req: Request<{}, {}, { ids?: unknown }>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'user') {
      res.status(403).json({ message: 'Only callers can delete call history' });
      return;
    }
    const authUser = req.user as UserDocument | undefined;
    if (!authUser?._id) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const rawIds = req.body?.ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      res.status(400).json({ message: 'ids required' });
      return;
    }

    const uid = new mongoose.Types.ObjectId(String(authUser._id));
    const objectIds = rawIds
      .map((id) => String(id).trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    if (objectIds.length === 0) {
      res.status(400).json({ message: 'No valid ids' });
      return;
    }

    const now = new Date();
    const result = await CallSession.updateMany(
      {
        _id: { $in: objectIds },
        callerId: uid,
        status: 'completed',
        callerHiddenAt: null,
      },
      { $set: { callerHiddenAt: now } }
    );

    res.status(200).json({ ok: true, deleted: result.modifiedCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('deleteCallerCallHistory error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /profile/receiver-call-history/delete — hide selected rows from receiver History.
 */
export const deleteReceiverCallHistory = async (
  req: Request<{}, {}, { ids?: unknown }>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'Only receivers can delete call history' });
      return;
    }
    if (blockReceiverUntilApproved(req, res)) return;

    const rawIds = req.body?.ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      res.status(400).json({ message: 'ids required' });
      return;
    }

    const rid = new mongoose.Types.ObjectId(String(req.receiver!._id));
    const objectIds = rawIds
      .map((id) => String(id).trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    if (objectIds.length === 0) {
      res.status(400).json({ message: 'No valid ids' });
      return;
    }

    const now = new Date();
    const result = await CallSession.updateMany(
      {
        _id: { $in: objectIds },
        receiverId: rid,
        status: 'completed',
        receiverHiddenAt: null,
      },
      { $set: { receiverHiddenAt: now } }
    );

    res.status(200).json({ ok: true, deleted: result.modifiedCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('deleteReceiverCallHistory error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /profile/caller-message-eligible-receivers — receiver ids the caller may message.
 */
export const getCallerMessageEligibleReceivers = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'user') {
      res.status(403).json({ message: 'Only callers can view message eligibility' });
      return;
    }
    const authUser = req.user as UserDocument | undefined;
    if (!authUser?._id) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    const uid = new mongoose.Types.ObjectId(String(authUser._id));
    const receiverIds = await CallSession.distinct('receiverId', {
      callerId: uid,
      status: 'completed',
      durationSec: { $gte: CALLER_MESSAGE_MIN_DURATION_SEC },
    });
    res.status(200).json({
      receiverIds: receiverIds.map((id) => String(id)),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getCallerMessageEligibleReceivers error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /profile/receiver-caller-online-notifications — persisted "caller is online" alerts.
 */
export const getReceiverCallerOnlineNotifications = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'Only receivers can view these notifications' });
      return;
    }
    if (blockReceiverUntilApproved(req, res)) return;

    const receiverId = new mongoose.Types.ObjectId(String(req.receiver!._id));
    const rows = await CallerOnlineNotification.find({ receiverId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean<
        {
          _id: mongoose.Types.ObjectId;
          callerIds: mongoose.Types.ObjectId[];
          title: string;
          subtitle: string;
          createdAt: Date;
        }[]
      >();

    const callerIds = [
      ...new Set(rows.flatMap((r) => r.callerIds.map((id) => String(id)))),
    ];
    const callers =
      callerIds.length === 0
        ? []
        : await User.find({ _id: { $in: callerIds.map((id) => new mongoose.Types.ObjectId(id)) } })
            .select('_id name profileImage')
            .lean<{ _id: mongoose.Types.ObjectId; name: string; profileImage?: string | null }[]>();
    const callerById = new Map(
      callers.map((c) => [
        String(c._id),
        { name: c.name?.trim() || 'Caller', profileImage: c.profileImage ?? null },
      ])
    );

    res.status(200).json({
      notifications: rows.map((row) => {
        const ids = row.callerIds.map((id) => String(id));
        const primaryId = ids[0] ?? '';
        const primary = callerById.get(primaryId);
        return {
          id: String(row._id),
          callerIds: ids,
          callerName: primary?.name ?? 'Caller',
          callerImage: primary?.profileImage ?? null,
          title: row.title,
          subtitle: row.subtitle,
          at: row.createdAt.toISOString(),
        };
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getReceiverCallerOnlineNotifications error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /profile/caller-notifications — caller notifications (transaction/chat/call).
 */
export const getCallerNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.accountKind !== 'user') {
      res.status(403).json({ message: 'Only callers can view notifications' });
      return;
    }
    const authUser = req.user as UserDocument | undefined;
    if (!authUser?._id) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    const uid = new mongoose.Types.ObjectId(String(authUser._id));

    const [topups, walletCredits, callRows, convoRows, availabilityRows] = await Promise.all([
      WalletTopup.find({ userId: uid })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('payAmount creditAdded createdAt')
        .lean<{ _id: mongoose.Types.ObjectId; payAmount: number; creditAdded: number; createdAt: Date }[]>(),
      WalletCredit.find({ userId: uid })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('source amountInr description createdAt')
        .lean<
          {
            _id: mongoose.Types.ObjectId;
            source: string;
            amountInr: number;
            description: string;
            createdAt: Date;
          }[]
        >(),
      CallSession.find({ callerId: uid, status: 'completed' })
        .sort({ startedAt: -1 })
        .limit(20)
        .select('receiverId durationSec startedAt')
        .lean<{ _id: mongoose.Types.ObjectId; receiverId: mongoose.Types.ObjectId; durationSec: number; startedAt: Date }[]>(),
      ChatMessage.aggregate<{
        receiverId: string;
        lastText: string;
        lastAt: Date;
      }>([
        { $match: { userId: uid } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$receiverId',
            lastText: { $first: '$text' },
            lastAt: { $first: '$createdAt' },
          },
        },
        {
          $project: {
            _id: 0,
            receiverId: { $toString: '$_id' },
            lastText: 1,
            lastAt: 1,
          },
        },
      ]),
      ReceiverAvailabilityNotification.find({ userId: uid })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('title subtitle createdAt')
        .lean<{ _id: mongoose.Types.ObjectId; title: string; subtitle: string; createdAt: Date }[]>(),
    ]);

    const receiverIds = [
      ...new Set([
        ...callRows.map((r) => String(r.receiverId)),
        ...convoRows.map((r) => r.receiverId),
      ]),
    ];
    const receivers =
      receiverIds.length === 0
        ? []
        : await Receiver.find({ _id: { $in: receiverIds.map((id) => new mongoose.Types.ObjectId(id)) } })
            .select('_id name')
            .lean<{ _id: mongoose.Types.ObjectId; name: string }[]>();
    const receiverNameById = new Map(receivers.map((r) => [String(r._id), r.name]));

    const notifications = [
      ...topups.map((row) => ({
        id: `txn-${String(row._id)}`,
        type: 'transaction' as const,
        title: 'Wallet Recharge Successful',
        subtitle: `₹${roundInr(row.payAmount)} credited ₹${roundInr(row.creditAdded)}`,
        at: row.createdAt.toISOString(),
      })),
      ...walletCredits.map((row) => ({
        id: `credit-${String(row._id)}`,
        type: 'transaction' as const,
        title: 'Referral Reward Credited',
        subtitle: `+₹${roundInr(row.amountInr)} · ${row.description}`,
        at: row.createdAt.toISOString(),
      })),
      ...callRows.map((row) => ({
        id: `call-${String(row._id)}`,
        type: 'call' as const,
        title: `Call with ${receiverNameById.get(String(row.receiverId)) ?? 'Receiver'}`,
        subtitle: callerCallNotificationSubtitle(row.durationSec),
        at: row.startedAt.toISOString(),
      })),
      ...convoRows.map((row) => ({
        id: `chat-${row.receiverId}`,
        type: 'chat' as const,
        title: `Message from ${receiverNameById.get(row.receiverId) ?? 'Receiver'}`,
        subtitle: row.lastText || 'New chat message',
        at: row.lastAt.toISOString(),
      })),
      ...availabilityRows.map((row) => ({
        id: `avail-${String(row._id)}`,
        type: 'call' as const,
        title: row.title,
        subtitle: row.subtitle,
        at: row.createdAt.toISOString(),
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    res.status(200).json({ notifications: notifications.slice(0, 50) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getCallerNotifications error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};
