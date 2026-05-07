"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyCallerFemaleVoice = verifyCallerFemaleVoice;
function asNumber(v) {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}
function asString(v) {
    return typeof v === 'string' ? v.trim() : '';
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
async function verifyCallerFemaleVoice(userAudioUrl) {
    const modelId = asString(process.env.HF_VOICE_GENDER_MODEL_ID) || 'audeering/wav2vec2-large-robust-24-ft-age-gender';
    const hfToken = asString(process.env.HF_API_TOKEN);
    if (!hfToken) {
        return {
            ok: false,
            predictedGender: 'unknown',
            confidence: 0,
            model: modelId,
            reason: 'HF_API_TOKEN is not configured',
        };
    }
    const timeoutMs = asNumber(process.env.VOICE_GENDER_TIMEOUT_MS) ?? 20000;
    const minFemaleConfidence = asNumber(process.env.VOICE_GENDER_FEMALE_MIN_CONFIDENCE) ?? 0.7;
    // Keep "org/model" slash intact; encoding it as %2F causes 404 on HF model routes.
    const endpoint = `https://router.huggingface.co/hf-inference/models/${modelId}`;
    const fetchImpl = globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
        return {
            ok: false,
            predictedGender: 'unknown',
            confidence: 0,
            model: 'unavailable',
            reason: 'Global fetch is not available in this Node runtime',
        };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
    try {
        const audioFetch = await fetchImpl(userAudioUrl, { method: 'GET', signal: controller.signal });
        if (!audioFetch.ok) {
            return {
                ok: false,
                predictedGender: 'unknown',
                confidence: 0,
                model: modelId,
                reason: `Could not fetch audio URL (HTTP ${audioFetch.status})`,
            };
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
        if (!rsp.ok) {
            let details = '';
            try {
                const errBody = (await rsp.json());
                details = asString(errBody.error) || asString(errBody.message);
            }
            catch {
                details = '';
            }
            return {
                ok: false,
                predictedGender: 'unknown',
                confidence: 0,
                model: modelId,
                reason: details
                    ? `Hugging Face returned HTTP ${rsp.status}: ${details}`
                    : `Hugging Face returned HTTP ${rsp.status}`,
            };
        }
        const body = (await rsp.json());
        const errorMsg = body && typeof body === 'object' && !Array.isArray(body)
            ? asString(body.error)
            : '';
        if (errorMsg) {
            return {
                ok: false,
                predictedGender: 'unknown',
                confidence: 0,
                model: modelId,
                raw: body,
                reason: `Hugging Face error: ${errorMsg}`,
            };
        }
        let predictedGender = 'unknown';
        let confidence = 0;
        if (Array.isArray(body)) {
            const first = body[0];
            // Some HF routes return [[{label,score}, ...]]
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
            // Fallback for { labels:[], scores:[] } style payloads.
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
        const model = modelId;
        const approved = predictedGender === 'female' && confidence >= minFemaleConfidence;
        return {
            ok: approved,
            predictedGender,
            confidence,
            model,
            raw: body,
            reason: approved
                ? undefined
                : `Predicted=${predictedGender}, confidence=${confidence.toFixed(3)}, threshold=${minFemaleConfidence.toFixed(3)}`,
        };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            ok: false,
            predictedGender: 'unknown',
            confidence: 0,
            model: 'request-failed',
            reason: msg,
        };
    }
    finally {
        clearTimeout(timer);
    }
}
