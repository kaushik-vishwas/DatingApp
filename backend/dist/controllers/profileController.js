"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCallerProfile = exports.completeCallerProfile = exports.completeProfile = void 0;
const User_1 = __importDefault(require("../models/User"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const callerProfileAllowlist_1 = require("../constants/callerProfileAllowlist");
const authController_1 = require("./authController");
const birthDate_1 = require("../utils/birthDate");
const MAX_CALLER_EDIT_INTERESTS = 3;
const MAX_CALLER_EDIT_LANGUAGES = 2;
function filterAllowlisted(arr, allow, max) {
    if (!Array.isArray(arr))
        return [];
    const out = [];
    for (const x of arr) {
        const s = typeof x === 'string' ? x.trim() : '';
        if (!s || !allow.has(s))
            continue;
        if (!out.includes(s))
            out.push(s);
        if (out.length >= max)
            break;
    }
    return out;
}
/**
 * POST /profile/complete
 * Saves profile URLs and marks account pending_review (receivers only).
 */
const completeProfile = async (req, res) => {
    try {
        if (req.accountKind !== 'receiver') {
            res.status(403).json({ message: 'This endpoint is only for receiver accounts' });
            return;
        }
        const authReceiver = req.receiver;
        if (!authReceiver?._id) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        const { name, profileImage, aadhaarFront, aadhaarBack, languages, interests, gender, dateOfBirth, state, bankAccountHolderName, bankAccountType, bankAccountNumber, bankIfsc, bankName, audioCallRate, } = req.body;
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
        const dob = (0, birthDate_1.parseDateOnlyToUtcMidnight)(dateOfBirth);
        if (!dob) {
            res.status(400).json({ message: 'dateOfBirth is required (YYYY-MM-DD)' });
            return;
        }
        const dobErr = (0, birthDate_1.validateBirthDateForAccount)(dob);
        if (dobErr) {
            res.status(400).json({ message: dobErr });
            return;
        }
        const computedAge = (0, birthDate_1.calculateAgeFromBirthDateUtc)(dob);
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
        const receiver = await Receiver_1.default.findById(authReceiver._id);
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
            user: (0, authController_1.toApiReceiver)(receiver),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('completeProfile error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.completeProfile = completeProfile;
/**
 * POST /profile/complete-caller
 * App user profile (`users` collection) — marks account approved.
 */
const completeCallerProfile = async (req, res) => {
    try {
        if (req.accountKind !== 'user') {
            res.status(403).json({ message: 'This endpoint is only for app user accounts' });
            return;
        }
        const authUser = req.user;
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
        const dob = (0, birthDate_1.parseDateOnlyToUtcMidnight)(dateOfBirth);
        if (!dob) {
            res.status(400).json({ message: 'dateOfBirth is required (YYYY-MM-DD)' });
            return;
        }
        const dobErr = (0, birthDate_1.validateBirthDateForAccount)(dob);
        if (dobErr) {
            res.status(400).json({ message: dobErr });
            return;
        }
        const computedAge = (0, birthDate_1.calculateAgeFromBirthDateUtc)(dob);
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
        const user = await User_1.default.findById(authUser._id);
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
            user: (0, authController_1.toApiUser)(user),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('completeCallerProfile error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.completeCallerProfile = completeCallerProfile;
/**
 * PATCH /profile/caller — approved app users only; updates profile fields (same shape as complete-caller).
 */
const updateCallerProfile = async (req, res) => {
    try {
        if (req.accountKind !== 'user') {
            res.status(403).json({ message: 'This endpoint is only for app user accounts' });
            return;
        }
        const authUser = req.user;
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
        const dob = (0, birthDate_1.parseDateOnlyToUtcMidnight)(dateOfBirth);
        if (!dob) {
            res.status(400).json({ message: 'dateOfBirth is required (YYYY-MM-DD)' });
            return;
        }
        const dobErr = (0, birthDate_1.validateBirthDateForAccount)(dob);
        if (dobErr) {
            res.status(400).json({ message: dobErr });
            return;
        }
        const computedAge = (0, birthDate_1.calculateAgeFromBirthDateUtc)(dob);
        if (!state || !String(state).trim()) {
            res.status(400).json({ message: 'state is required' });
            return;
        }
        const langs = filterAllowlisted(languages, callerProfileAllowlist_1.CALLER_LANGUAGE_ALLOWLIST, MAX_CALLER_EDIT_LANGUAGES);
        const ints = filterAllowlisted(interests, callerProfileAllowlist_1.CALLER_INTEREST_ALLOWLIST, MAX_CALLER_EDIT_INTERESTS);
        if (langs.length === 0) {
            res.status(400).json({ message: 'Select at least one valid language (max 2)' });
            return;
        }
        if (ints.length === 0) {
            res.status(400).json({ message: 'Select at least one valid interest (max 3)' });
            return;
        }
        const user = await User_1.default.findById(authUser._id);
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
            user: (0, authController_1.toApiUser)(user),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('updateCallerProfile error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.updateCallerProfile = updateCallerProfile;
