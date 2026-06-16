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
function shouldFallbackToLocalFromHf(reason) {
    const lower = reason.toLowerCase();
    if (lower.includes('not supported'))
        return true;
    if (lower.includes('returned http 404'))
        return true;
    if (lower.includes('returned http 503'))
        return true;
    const raw = asString(process.env.VOICE_GENDER_HF_FALLBACK_TO_LOCAL).toLowerCase();
    if (raw === 'false' || raw === '0' || raw === 'off')
        return false;
    return process.env.NODE_ENV !== 'production';
}
function normalizeLabel(raw) {
    const v = asString(raw).toLowerCase();
    if (v.includes('female') || v === 'f')
        return 'female';
    if (v.includes('male') || v === 'm')
        return 'male';
    if (v.includes('other') || v.includes('non'))
        return 'other';
    return 'unknown';
}
function pickTopFromScores(rows) {
    let topLabel = 'unknown';
    let topScore = 0;
    for (const row of rows) {
        const label = normalizeLabel(row.label);
        const score = Math.max(0, Math.min(1, asNumber(row.score) ?? 0));
        if (score > topScore) {
            topScore = score;
            topLabel = label;
        }
    }
    return { label: topLabel, score: topScore };
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
function classifyServiceFailure(reason) {
    const lower = reason.toLowerCase();
    if (lower.includes('hf_api_token') || lower.includes('not configured')) {
        return 'misconfigured';
    }
    if (lower.includes('could not fetch audio')) {
        return 'audio_fetch_failed';
    }
    return 'service_unavailable';
}
function buildFailureResult(partial) {
    const reason = partial.reason ?? '';
    const failureKind = partial.failureKind ??
        (reason ? classifyServiceFailure(reason) : 'service_unavailable');
    return { ok: false, ...partial, failureKind };
}
function logVoiceGenderTerminal(tag, payload) {
    console.log(`[${tag}]`, JSON.stringify(payload, null, 2));
}
function parseResponseBody(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            return JSON.parse(trimmed);
        }
        catch {
            return text;
        }
    }
    return text;
}
function logHuggingFaceApiResponse(input) {
    logVoiceGenderTerminal('voice-gender-hf', {
        huggingFace: input,
    });
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
        logVoiceGenderTerminal('voice-gender-hf', {
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
    if (readVerificationProvider() === 'local') {
        const { classifyVoiceGenderLocally } = await Promise.resolve().then(() => __importStar(require('./voiceGenderLocalClassifier')));
        return classifyVoiceGenderLocally(userAudioUrl, expectedGender);
    }
    const modelId = asString(process.env.HF_VOICE_GENDER_MODEL_ID) || 'audeering/wav2vec2-large-robust-24-ft-age-gender';
    const hfToken = asString(process.env.HF_API_TOKEN);
    if (!hfToken) {
        return buildFailureResult({
            predictedGender: 'unknown',
            confidence: 0,
            model: modelId,
            reason: 'HF_API_TOKEN is not configured',
            failureKind: 'misconfigured',
        });
    }
    const timeoutMs = asNumber(process.env.VOICE_GENDER_TIMEOUT_MS) ?? 20000;
    const minConfidence = minConfidenceForExpectedGender(expectedGender);
    const endpoint = `https://router.huggingface.co/hf-inference/models/${modelId}`;
    const fetchImpl = globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
        return buildFailureResult({
            predictedGender: 'unknown',
            confidence: 0,
            model: 'unavailable',
            reason: 'Global fetch is not available in this Node runtime',
            failureKind: 'service_unavailable',
        });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
    try {
        const audioFetch = await fetchImpl(userAudioUrl, { method: 'GET', signal: controller.signal });
        if (!audioFetch.ok) {
            logVoiceGenderTerminal('voice-gender-hf', {
                audioFetch: {
                    audioUrl: userAudioUrl,
                    httpStatus: audioFetch.status,
                    ok: false,
                },
            });
            return buildFailureResult({
                predictedGender: 'unknown',
                confidence: 0,
                model: modelId,
                reason: `Could not fetch audio URL (HTTP ${audioFetch.status})`,
                failureKind: 'audio_fetch_failed',
            });
        }
        const audioBytes = await audioFetch.arrayBuffer();
        const rsp = await fetchImpl(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${hfToken}`,
                'Content-Type': 'application/octet-stream',
            },
            body: audioBytes,
            signal: controller.signal,
        });
        const responseText = await rsp.text();
        const body = parseResponseBody(responseText);
        logHuggingFaceApiResponse({
            endpoint,
            modelId,
            audioUrl: userAudioUrl,
            audioBytes: audioBytes.byteLength,
            httpStatus: rsp.status,
            ok: rsp.ok,
            body,
        });
        if (!rsp.ok) {
            let details = '';
            if (body && typeof body === 'object' && !Array.isArray(body)) {
                const errBody = body;
                details = asString(errBody.error) || asString(errBody.message);
            }
            else if (typeof body === 'string') {
                details = body.trim();
            }
            const reason = details
                ? `Hugging Face returned HTTP ${rsp.status}: ${details}`
                : `Hugging Face returned HTTP ${rsp.status}`;
            const failed = buildFailureResult({
                predictedGender: 'unknown',
                confidence: 0,
                model: modelId,
                raw: body,
                reason,
                failureKind: 'service_unavailable',
            });
            if (shouldFallbackToLocalFromHf(reason)) {
                logVoiceGenderTerminal('voice-gender-hf', {
                    fallbackToLocal: true,
                    reason,
                    audioUrl: userAudioUrl,
                    expectedGender,
                });
                const { classifyVoiceGenderLocally } = await Promise.resolve().then(() => __importStar(require('./voiceGenderLocalClassifier')));
                return classifyVoiceGenderLocally(userAudioUrl, expectedGender);
            }
            return failed;
        }
        const errorMsg = body && typeof body === 'object' && !Array.isArray(body)
            ? asString(body.error)
            : '';
        if (errorMsg) {
            const failed = buildFailureResult({
                predictedGender: 'unknown',
                confidence: 0,
                model: modelId,
                raw: body,
                reason: `Hugging Face error: ${errorMsg}`,
                failureKind: 'service_unavailable',
            });
            if (shouldFallbackToLocalFromHf(errorMsg)) {
                logVoiceGenderTerminal('voice-gender-hf', {
                    fallbackToLocal: true,
                    reason: errorMsg,
                    audioUrl: userAudioUrl,
                    expectedGender,
                });
                const { classifyVoiceGenderLocally } = await Promise.resolve().then(() => __importStar(require('./voiceGenderLocalClassifier')));
                return classifyVoiceGenderLocally(userAudioUrl, expectedGender);
            }
            return failed;
        }
        let predictedGender = 'unknown';
        let confidence = 0;
        if (Array.isArray(body)) {
            const first = body[0];
            if (Array.isArray(first)) {
                const top = pickTopFromScores(first);
                predictedGender = top.label;
                confidence = top.score;
            }
            else {
                const top = pickTopFromScores(body);
                predictedGender = top.label;
                confidence = top.score;
            }
        }
        else if (body && typeof body === 'object') {
            const obj = body;
            const labels = Array.isArray(obj.labels) ? obj.labels : [];
            const scores = Array.isArray(obj.scores) ? obj.scores : [];
            const rows = [];
            for (let i = 0; i < Math.min(labels.length, scores.length); i += 1) {
                rows.push({ label: labels[i], score: scores[i] });
            }
            const top = pickTopFromScores(rows);
            predictedGender = top.label;
            confidence = top.score;
        }
        if (predictedGender === 'unknown') {
            return buildFailureResult({
                predictedGender,
                confidence,
                model: modelId,
                raw: body,
                reason: 'Could not read gender prediction from Hugging Face response',
                failureKind: 'service_unavailable',
            });
        }
        if (predictedGender !== expectedGender) {
            return {
                ok: false,
                predictedGender,
                confidence,
                model: modelId,
                raw: body,
                failureKind: 'gender_mismatch',
                reason: `Predicted=${predictedGender}, expected=${expectedGender}, confidence=${confidence.toFixed(3)}`,
            };
        }
        if (confidence < minConfidence) {
            return {
                ok: false,
                predictedGender,
                confidence,
                model: modelId,
                raw: body,
                failureKind: 'low_confidence',
                reason: `Predicted=${predictedGender}, confidence=${confidence.toFixed(3)}, threshold=${minConfidence.toFixed(3)}`,
            };
        }
        return {
            ok: true,
            predictedGender,
            confidence,
            model: modelId,
            raw: body,
        };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logVoiceGenderTerminal('voice-gender-hf', {
            requestFailed: true,
            audioUrl: userAudioUrl,
            error: msg,
        });
        return buildFailureResult({
            predictedGender: 'unknown',
            confidence: 0,
            model: 'request-failed',
            reason: msg,
            failureKind: 'service_unavailable',
        });
    }
    finally {
        clearTimeout(timer);
    }
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
