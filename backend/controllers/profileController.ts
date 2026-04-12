import type { Request, Response } from 'express';
import User, { type Gender, type UserDocument } from '../models/User';
import Receiver, { type ReceiverDocument } from '../models/Receiver';
import { CALLER_INTEREST_ALLOWLIST, CALLER_LANGUAGE_ALLOWLIST } from '../constants/callerProfileAllowlist';
import { toApiReceiver, toApiUser } from './authController';
import {
  calculateAgeFromBirthDateUtc,
  parseDateOnlyToUtcMidnight,
  validateBirthDateForAccount,
} from '../utils/birthDate';

type CompleteProfileBody = {
  name: string;
  profileImage: string;
  aadhaarFront: string;
  aadhaarBack: string;
  languages: string[];
  interests: string[];
  gender: Gender;
  /** `YYYY-MM-DD` */
  dateOfBirth: string;
  state: string;
  bankAccountHolderName: string;
  bankAccountType: 'savings' | 'current';
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
  audioCallRate: number;
};

type CompleteCallerBody = {
  name: string;
  profileImage: string;
  languages: string[];
  interests: string[];
  gender: Gender;
  /** `YYYY-MM-DD` */
  dateOfBirth: string;
  state: string;
};

type UpdateCallerBody = CompleteCallerBody;

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
 * POST /profile/complete
 * Saves profile URLs and marks account pending_review (receivers only).
 */
export const completeProfile = async (
  req: Request<{}, {}, CompleteProfileBody>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'receiver') {
      res.status(403).json({ message: 'This endpoint is only for receiver accounts' });
      return;
    }

    const authReceiver = req.receiver as ReceiverDocument | undefined;
    if (!authReceiver?._id) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const {
      name,
      profileImage,
      aadhaarFront,
      aadhaarBack,
      languages,
      interests,
      gender,
      dateOfBirth,
      state,
      bankAccountHolderName,
      bankAccountType,
      bankAccountNumber,
      bankIfsc,
      bankName,
      audioCallRate,
    } = req.body;

    if (!name || !String(name).trim()) {
      res.status(400).json({ message: 'name is required' });
      return;
    }
    if (!profileImage || typeof profileImage !== 'string') {
      res.status(400).json({ message: 'profileImage URL is required' });
      return;
    }
    if (!aadhaarFront || typeof aadhaarFront !== 'string') {
      res.status(400).json({ message: 'aadhaarFront URL is required' });
      return;
    }
    if (!aadhaarBack || typeof aadhaarBack !== 'string') {
      res.status(400).json({ message: 'aadhaarBack URL is required' });
      return;
    }
    if (!Array.isArray(languages) || languages.length === 0) {
      res.status(400).json({ message: 'At least one language is required' });
      return;
    }
    if (!Array.isArray(interests) || interests.length === 0) {
      res.status(400).json({ message: 'At least one interest is required' });
      return;
    }
    if (gender !== 'male' && gender !== 'female' && gender !== 'other') {
      res.status(400).json({ message: 'gender must be male, female, or other' });
      return;
    }
    const dob = parseDateOnlyToUtcMidnight(dateOfBirth);
    if (!dob) {
      res.status(400).json({ message: 'dateOfBirth is required (YYYY-MM-DD)' });
      return;
    }
    const dobErr = validateBirthDateForAccount(dob);
    if (dobErr) {
      res.status(400).json({ message: dobErr });
      return;
    }
    const computedAge = calculateAgeFromBirthDateUtc(dob);
    if (!state || !String(state).trim()) {
      res.status(400).json({ message: 'state is required' });
      return;
    }
    if (!bankAccountHolderName || !String(bankAccountHolderName).trim()) {
      res.status(400).json({ message: 'bankAccountHolderName is required' });
      return;
    }
    if (bankAccountType !== 'savings' && bankAccountType !== 'current') {
      res.status(400).json({ message: 'bankAccountType must be savings or current' });
      return;
    }
    if (!bankAccountNumber || !String(bankAccountNumber).trim()) {
      res.status(400).json({ message: 'bankAccountNumber is required' });
      return;
    }
    if (!bankIfsc || !String(bankIfsc).trim()) {
      res.status(400).json({ message: 'bankIfsc is required' });
      return;
    }
    if (!bankName || !String(bankName).trim()) {
      res.status(400).json({ message: 'bankName is required' });
      return;
    }
    const rateNum = Number(audioCallRate);
    if (!Number.isFinite(rateNum) || rateNum < 1 || rateNum > 99_999) {
      res.status(400).json({ message: 'audioCallRate must be a number between 1 and 99999 (INR per minute)' });
      return;
    }

    const receiver = await Receiver.findById(authReceiver._id);
    if (!receiver) {
      res.status(404).json({ message: 'Receiver not found' });
      return;
    }

    if (receiver.accountStatus !== 'pending_profile') {
      res.status(400).json({
        message: 'Profile already submitted or cannot be edited this way',
      });
      return;
    }

    const front = String(aadhaarFront).trim();
    const back = String(aadhaarBack).trim();

    receiver.name = String(name).trim();
    receiver.profileImage = profileImage.trim();
    receiver.aadhaarFront = front;
    receiver.aadhaarBack = back;
    receiver.documents = [front, back];
    receiver.languages = languages.map((l) => String(l).trim()).filter(Boolean);
    receiver.interests = interests.map((i) => String(i).trim()).filter(Boolean);
    receiver.gender = gender;
    receiver.dateOfBirth = dob;
    receiver.age = computedAge;
    receiver.state = String(state).trim();
    receiver.bankAccountHolderName = String(bankAccountHolderName).trim();
    receiver.bankAccountType = bankAccountType;
    receiver.bankAccountNumber = String(bankAccountNumber).trim();
    receiver.bankIfsc = String(bankIfsc).trim().toUpperCase();
    receiver.bankName = String(bankName).trim();
    receiver.audioCallRate = Math.round(rateNum * 100) / 100;
    receiver.accountStatus = 'pending_review';

    await receiver.save();

    res.status(200).json({
      message: 'Profile submitted for review',
      user: toApiReceiver(receiver),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('completeProfile error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /profile/complete-caller
 * App user profile (`users` collection) — marks account approved.
 */
export const completeCallerProfile = async (
  req: Request<{}, {}, CompleteCallerBody>,
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

    const { name, profileImage, languages, interests, gender, dateOfBirth, state } = req.body;

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
    const dob = parseDateOnlyToUtcMidnight(dateOfBirth);
    if (!dob) {
      res.status(400).json({ message: 'dateOfBirth is required (YYYY-MM-DD)' });
      return;
    }
    const dobErr = validateBirthDateForAccount(dob);
    if (dobErr) {
      res.status(400).json({ message: dobErr });
      return;
    }
    const computedAge = calculateAgeFromBirthDateUtc(dob);
    if (!state || !String(state).trim()) {
      res.status(400).json({ message: 'state is required' });
      return;
    }
    if (!Array.isArray(languages) || languages.length === 0) {
      res.status(400).json({ message: 'At least one language is required' });
      return;
    }
    if (!Array.isArray(interests) || interests.length === 0) {
      res.status(400).json({ message: 'At least one interest is required' });
      return;
    }

    const user = await User.findById(authUser._id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    if (user.accountStatus !== 'pending_profile') {
      res.status(400).json({
        message: 'Profile already submitted or cannot be edited this way',
      });
      return;
    }

    user.name = String(name).trim();
    user.profileImage = String(profileImage).trim();
    user.languages = languages.map((l) => String(l).trim()).filter(Boolean);
    user.interests = interests.map((i) => String(i).trim()).filter(Boolean);
    user.gender = gender;
    user.dateOfBirth = dob;
    user.age = computedAge;
    user.state = String(state).trim();
    user.accountStatus = 'approved';

    await user.save();

    res.status(200).json({
      message: 'Profile saved',
      user: toApiUser(user),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('completeCallerProfile error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
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

    const { name, profileImage, languages, interests, gender, dateOfBirth, state } = req.body;

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
    const dob = parseDateOnlyToUtcMidnight(dateOfBirth);
    if (!dob) {
      res.status(400).json({ message: 'dateOfBirth is required (YYYY-MM-DD)' });
      return;
    }
    const dobErr = validateBirthDateForAccount(dob);
    if (dobErr) {
      res.status(400).json({ message: dobErr });
      return;
    }
    const computedAge = calculateAgeFromBirthDateUtc(dob);
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

    if (user.accountStatus !== 'approved') {
      res.status(400).json({ message: 'Profile can only be edited after your account is approved' });
      return;
    }

    user.name = String(name).trim();
    user.profileImage = String(profileImage).trim();
    user.languages = langs;
    user.interests = ints;
    user.gender = gender;
    user.dateOfBirth = dob;
    user.age = computedAge;
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
