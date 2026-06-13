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
exports.classifyVoiceGenderLocally = classifyVoiceGenderLocally;
const voiceGenderAudioLoader_1 = require("./voiceGenderAudioLoader");
const LOCAL_MODEL_ID = process.env.VOICE_GENDER_LOCAL_MODEL_ID?.trim() ||
    'Xenova/wav2vec2-large-xlsr-53-gender-recognition-librispeech';
let pipelinePromise = null;
function asNumber(v) {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}
function normalizeLabel(raw) {
    const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (v.includes('female') || v === 'f')
        return 'female';
    if (v.includes('male') || v === 'm')
        return 'male';
    if (v.includes('other') || v.includes('non') || v.includes('child'))
        return 'other';
    return 'unknown';
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
function pickTopPrediction(rows) {
    let topLabel = 'unknown';
    let topScore = 0;
    for (const row of rows) {
        const label = normalizeLabel(row.label);
        if (label !== 'female' && label !== 'male')
            continue;
        const score = Math.max(0, Math.min(1, asNumber(row.score) ?? 0));
        if (score > topScore) {
            topScore = score;
            topLabel = label;
        }
    }
    return { predictedGender: topLabel, confidence: topScore };
}
async function getClassifier() {
    if (!pipelinePromise) {
        pipelinePromise = (async () => {
            const { pipeline } = await Promise.resolve().then(() => __importStar(require('@huggingface/transformers')));
            const pipe = await pipeline('audio-classification', LOCAL_MODEL_ID);
            return pipe;
        })();
    }
    return pipelinePromise;
}
async function classifyVoiceGenderLocally(audioSource, expectedGender) {
    if (expectedGender === 'other') {
        return {
            ok: true,
            predictedGender: 'other',
            confidence: 1,
            model: LOCAL_MODEL_ID,
        };
    }
    const minConfidence = minConfidenceForExpectedGender(expectedGender);
    try {
        const classifier = await getClassifier();
        const samples = await (0, voiceGenderAudioLoader_1.loadVoiceAudioSamples)(audioSource);
        const raw = (await classifier(samples, { topk: 5 }));
        const { predictedGender, confidence } = pickTopPrediction(raw);
        console.log('[voice-gender-local]', JSON.stringify({
            model: LOCAL_MODEL_ID,
            audioSource,
            expectedGender,
            raw,
            predictedGender,
            confidence,
            threshold: minConfidence,
        }, null, 2));
        if (predictedGender === 'unknown') {
            return {
                ok: false,
                predictedGender,
                confidence,
                model: LOCAL_MODEL_ID,
                raw,
                failureKind: 'service_unavailable',
                reason: 'Could not read gender prediction from local model output',
            };
        }
        if (predictedGender !== expectedGender) {
            return {
                ok: false,
                predictedGender,
                confidence,
                model: LOCAL_MODEL_ID,
                raw,
                failureKind: 'gender_mismatch',
                reason: `Predicted=${predictedGender}, expected=${expectedGender}, confidence=${confidence.toFixed(3)}`,
            };
        }
        if (confidence < minConfidence) {
            return {
                ok: false,
                predictedGender,
                confidence,
                model: LOCAL_MODEL_ID,
                raw,
                failureKind: 'low_confidence',
                reason: `Predicted=${predictedGender}, confidence=${confidence.toFixed(3)}, threshold=${minConfidence.toFixed(3)}`,
            };
        }
        return {
            ok: true,
            predictedGender,
            confidence,
            model: LOCAL_MODEL_ID,
            raw,
        };
    }
    catch (err) {
        let msg = err instanceof Error ? err.message : String(err);
        if (/cannot find module '@huggingface\/transformers'/i.test(msg)) {
            msg =
                'Voice AI package missing on server. Run: cd backend && npm install && npm run build && pm2 restart dating-backend';
        }
        console.log('[voice-gender-local]', JSON.stringify({ model: LOCAL_MODEL_ID, audioSource, expectedGender, error: msg }, null, 2));
        return {
            ok: false,
            predictedGender: 'unknown',
            confidence: 0,
            model: LOCAL_MODEL_ID,
            failureKind: 'service_unavailable',
            reason: msg,
        };
    }
}
