"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyVoiceGender = verifyVoiceGender;
exports.verifyCallerFemaleVoice = verifyCallerFemaleVoice;
exports.voiceGenderThreshold = voiceGenderThreshold;
exports.getVoiceVerificationMode = getVoiceVerificationMode;
function asNumber(v) {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}
function asString(v) {
    return typeof v === 'string' ? v.trim() : '';
}
function readVerificationMode() {
    const raw = asString(process.env.VOICE_GENDER_VERIFICATION_MODE).toLowerCase();
    if (raw === 'disabled' || raw === 'off' || raw === 'skip')
        return 'disabled';
    return 'required';
}
function readVerificationProvider() {
    const raw = asString(process.env.VOICE_GENDER_PROVIDER).toLowerCase();
    if (raw === 'huggingface' || raw === 'hf')
        return 'huggingface';
    return 'local';
}
function minConfidenceForExpectedGender(expectedGender) {
    if (expectedGender === 'female') {
        return asNumber(process.env.VOICE_GENDER_FEMALE_MIN_CONFIDENCE) ?? 0.7;
    }
    if (expectedGender === 'male') {
        return asNumber(process.env.VOICE_GENDER_MALE_MIN_CONFIDENCE) ?? 0.7;
    }
    return 0;
}
function logVoiceGenderTerminal(tag, payload) {
    console.log(`[${tag}]`, JSON.stringify(payload, null, 2));
}
async function verifyVoiceGender(userAudioUrl, expectedGender) {
    if (expectedGender === 'other') {
        return {
            ok: true,
            predictedGender: 'other',
            confidence: 1,
            model: 'skipped',
        };
    }
    if (readVerificationMode() === 'disabled') {
        logVoiceGenderTerminal('voice-gender', {
            skipped: true,
            reason: 'VOICE_GENDER_VERIFICATION_MODE=disabled',
            audioUrl: userAudioUrl,
            expectedGender,
        });
        return {
            ok: true,
            predictedGender: expectedGender,
            confidence: 1,
            model: 'disabled',
            reason: 'Verification skipped (VOICE_GENDER_VERIFICATION_MODE=disabled)',
        };
    }
    const provider = readVerificationProvider();
    if (provider === 'huggingface') {
        // HF hosted Inference API does not expose audio-classification for gender models.
        // Real verification runs on-server via Transformers.js (same Xenova model family).
        logVoiceGenderTerminal('voice-gender', {
            providerRequested: 'huggingface',
            providerUsed: 'local',
            reason: 'HF Inference has no supported audio-classification endpoint for gender models; using local Transformers.js',
            audioUrl: userAudioUrl,
            expectedGender,
        });
    }
    const { classifyVoiceGenderLocally } = await Promise.resolve().then(() => __importStar(require('./voiceGenderLocalClassifier')));
    return classifyVoiceGenderLocally(userAudioUrl, expectedGender);
}
/** @deprecated Prefer verifyVoiceGender(url, 'female') */
async function verifyCallerFemaleVoice(userAudioUrl) {
    return verifyVoiceGender(userAudioUrl, 'female');
}
function voiceGenderThreshold(expectedGender) {
    return minConfidenceForExpectedGender(expectedGender);
}
function getVoiceVerificationMode() {
    return readVerificationMode();
}
