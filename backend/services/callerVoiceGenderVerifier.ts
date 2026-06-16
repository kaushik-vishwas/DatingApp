import { HfInference } from '@huggingface/inference';
import { cloudinaryWavUrl } from './voiceGenderAudioLoader';

type VoiceGenderLabel = 'female' | 'male' | 'other' | 'unknown';

/** Supported on HF Inference router (audeering model is not). */
const HF_SUPPORTED_VOICE_GENDER_MODEL =
  'alefiury/wav2vec2-large-xlsr-53-gender-recognition-librispeech';

export type ExpectedVoiceGender = 'female' | 'male' | 'other';

export type VoiceVerificationFailureKind =
  | 'gender_mismatch'
  | 'low_confidence'
  | 'service_unavailable'
  | 'audio_fetch_failed'
  | 'misconfigured';

export type VoiceGenderVerificationResult = {
  ok: boolean;
  predictedGender: VoiceGenderLabel;
  confidence: number;
  model: string;
  raw?: unknown;
  reason?: string;
  failureKind?: VoiceVerificationFailureKind;
};

function asNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function readVerificationMode(): 'required' | 'disabled' {
  const raw = asString(process.env.VOICE_GENDER_VERIFICATION_MODE).toLowerCase();
  if (raw === 'disabled' || raw === 'off' || raw === 'skip') return 'disabled';
  return 'required';
}

function readVerificationProvider(): 'local' | 'huggingface' {
  const raw = asString(process.env.VOICE_GENDER_PROVIDER).toLowerCase();
  if (raw === 'huggingface' || raw === 'hf') return 'huggingface';
  return 'local';
}

function shouldFallbackToLocalFromHf(reason: string): boolean {
  const raw = asString(process.env.VOICE_GENDER_HF_FALLBACK_TO_LOCAL).toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'on') return true;
  if (raw === 'false' || raw === '0' || raw === 'off') return false;
  const lower = reason.toLowerCase();
  if (lower.includes('not supported')) return true;
  if (lower.includes('returned http 404')) return true;
  if (lower.includes('returned http 503')) return true;
  return process.env.NODE_ENV !== 'production';
}

function hfVoiceGenderModelCandidates(): string[] {
  const configured =
    asString(process.env.HF_VOICE_GENDER_MODEL_ID) || HF_SUPPORTED_VOICE_GENDER_MODEL;
  const out: string[] = [];
  for (const id of [configured, HF_SUPPORTED_VOICE_GENDER_MODEL]) {
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

function isHfModelUnsupported(reason: string): boolean {
  const lower = reason.toLowerCase();
  return lower.includes('not supported') || lower.includes('model not found');
}

type HfClassificationRow = { label: string; score: number };

async function runHfAudioClassification(
  modelId: string,
  audioBytes: ArrayBuffer,
  token: string
): Promise<{ ok: true; rows: HfClassificationRow[] } | { ok: false; reason: string }> {
  const hf = new HfInference(token);
  try {
    const raw = await hf.audioClassification({
      model: modelId,
      data: audioBytes,
      provider: 'hf-inference',
    });
    const rows: HfClassificationRow[] = [];
    if (Array.isArray(raw)) {
      for (const row of raw) {
        if (!row || typeof row !== 'object') continue;
        const label = asString((row as { label?: unknown }).label);
        const score = asNumber((row as { score?: unknown }).score) ?? 0;
        if (label) rows.push({ label, score });
      }
    }
    if (rows.length === 0) {
      return { ok: false, reason: 'Empty Hugging Face audio-classification response' };
    }
    return { ok: true, rows };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg };
  }
}

function evaluateGenderPrediction(
  rows: HfClassificationRow[],
  modelId: string,
  expectedGender: ExpectedVoiceGender,
  minConfidence: number,
  raw: unknown
): VoiceGenderVerificationResult {
  const top = pickTopFromScores(rows as Array<Record<string, unknown>>);
  const predictedGender = top.label;
  const confidence = top.score;

  if (predictedGender === 'unknown') {
    return buildFailureResult({
      predictedGender,
      confidence,
      model: modelId,
      raw,
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
      model: modelId,
      raw,
      failureKind: 'low_confidence',
      reason: `Predicted=${predictedGender}, confidence=${confidence.toFixed(3)}, threshold=${minConfidence.toFixed(3)}`,
    };
  }

  return {
    ok: true,
    predictedGender,
    confidence,
    model: modelId,
    raw,
  };
}

function normalizeLabel(raw: unknown): VoiceGenderLabel {
  const v = asString(raw).toLowerCase();
  if (v.includes('female') || v === 'f') return 'female';
  if (v.includes('male') || v === 'm') return 'male';
  if (v.includes('other') || v.includes('non')) return 'other';
  return 'unknown';
}

function pickTopFromScores(rows: Array<Record<string, unknown>>): { label: VoiceGenderLabel; score: number } {
  let topLabel: VoiceGenderLabel = 'unknown';
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

function minConfidenceForExpectedGender(expectedGender: ExpectedVoiceGender): number {
  if (expectedGender === 'female') {
    return asNumber(process.env.VOICE_GENDER_FEMALE_MIN_CONFIDENCE) ?? 0.7;
  }
  if (expectedGender === 'male') {
    return asNumber(process.env.VOICE_GENDER_MALE_MIN_CONFIDENCE) ?? 0.7;
  }
  return 0;
}

function classifyServiceFailure(reason: string): VoiceVerificationFailureKind {
  const lower = reason.toLowerCase();
  if (lower.includes('hf_api_token') || lower.includes('not configured')) {
    return 'misconfigured';
  }
  if (lower.includes('could not fetch audio')) {
    return 'audio_fetch_failed';
  }
  return 'service_unavailable';
}

function buildFailureResult(
  partial: Omit<VoiceGenderVerificationResult, 'ok'> & { ok?: false }
): VoiceGenderVerificationResult {
  const reason = partial.reason ?? '';
  const failureKind =
    partial.failureKind ??
    (reason ? classifyServiceFailure(reason) : 'service_unavailable');
  return { ok: false, ...partial, failureKind };
}

function logVoiceGenderTerminal(tag: string, payload: Record<string, unknown>): void {
  console.log(`[${tag}]`, JSON.stringify(payload, null, 2));
}

export async function verifyVoiceGender(
  userAudioUrl: string,
  expectedGender: ExpectedVoiceGender
): Promise<VoiceGenderVerificationResult> {
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
    const { classifyVoiceGenderLocally } = await import('./voiceGenderLocalClassifier');
    return classifyVoiceGenderLocally(userAudioUrl, expectedGender);
  }

  const hfToken = asString(process.env.HF_API_TOKEN);
  if (!hfToken) {
    return buildFailureResult({
      predictedGender: 'unknown',
      confidence: 0,
      model: HF_SUPPORTED_VOICE_GENDER_MODEL,
      reason: 'HF_API_TOKEN is not configured',
      failureKind: 'misconfigured',
    });
  }

  const timeoutMs = asNumber(process.env.VOICE_GENDER_TIMEOUT_MS) ?? 20000;
  const minConfidence = minConfidenceForExpectedGender(expectedGender);
  const modelCandidates = hfVoiceGenderModelCandidates();

  const fetchImpl = (globalThis as { fetch?: unknown }).fetch;
  if (typeof fetchImpl !== 'function') {
    return buildFailureResult({
      predictedGender: 'unknown',
      confidence: 0,
      model: modelCandidates[0] ?? HF_SUPPORTED_VOICE_GENDER_MODEL,
      reason: 'Global fetch is not available in this Node runtime',
      failureKind: 'service_unavailable',
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  try {
    const audioFetchUrl = cloudinaryWavUrl(userAudioUrl);
    const audioFetch = await (
      fetchImpl as (input: string, init?: Record<string, unknown>) => Promise<{
        ok: boolean;
        status: number;
        arrayBuffer: () => Promise<ArrayBuffer>;
      }>
    )(audioFetchUrl, { method: 'GET', signal: controller.signal });
    if (!audioFetch.ok) {
      logVoiceGenderTerminal('voice-gender-hf', {
        audioFetch: {
          audioUrl: audioFetchUrl,
          httpStatus: audioFetch.status,
          ok: false,
        },
      });
      return buildFailureResult({
        predictedGender: 'unknown',
        confidence: 0,
        model: modelCandidates[0] ?? HF_SUPPORTED_VOICE_GENDER_MODEL,
        reason: `Could not fetch audio URL (HTTP ${audioFetch.status})`,
        failureKind: 'audio_fetch_failed',
      });
    }
    const audioBytes = await audioFetch.arrayBuffer();

    let lastReason = 'Hugging Face voice verification failed';
    for (const modelId of modelCandidates) {
      const hfResult = await runHfAudioClassification(modelId, audioBytes, hfToken);
      logVoiceGenderTerminal('voice-gender-hf', {
        huggingFace: {
          provider: 'hf-inference',
          modelId,
          audioUrl: userAudioUrl,
          audioFetchUrl,
          audioBytes: audioBytes.byteLength,
          ok: hfResult.ok,
          ...(hfResult.ok ? { body: hfResult.rows } : { error: hfResult.reason }),
        },
      });

      if (hfResult.ok) {
        return evaluateGenderPrediction(
          hfResult.rows,
          modelId,
          expectedGender,
          minConfidence,
          hfResult.rows
        );
      }

      lastReason = hfResult.reason;
      if (!isHfModelUnsupported(hfResult.reason)) {
        break;
      }
    }

    if (shouldFallbackToLocalFromHf(lastReason)) {
      logVoiceGenderTerminal('voice-gender-hf', {
        fallbackToLocal: true,
        reason: lastReason,
        audioUrl: userAudioUrl,
        expectedGender,
        triedModels: modelCandidates,
      });
      const { classifyVoiceGenderLocally } = await import('./voiceGenderLocalClassifier');
      return classifyVoiceGenderLocally(userAudioUrl, expectedGender);
    }

    return buildFailureResult({
      predictedGender: 'unknown',
      confidence: 0,
      model: modelCandidates[modelCandidates.length - 1] ?? HF_SUPPORTED_VOICE_GENDER_MODEL,
      reason: lastReason,
      failureKind: 'service_unavailable',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logVoiceGenderTerminal('voice-gender-hf', {
      requestFailed: true,
      audioUrl: userAudioUrl,
      error: msg,
    });
    if (shouldFallbackToLocalFromHf(msg)) {
      const { classifyVoiceGenderLocally } = await import('./voiceGenderLocalClassifier');
      return classifyVoiceGenderLocally(userAudioUrl, expectedGender);
    }
    return buildFailureResult({
      predictedGender: 'unknown',
      confidence: 0,
      model: 'request-failed',
      reason: msg,
      failureKind: 'service_unavailable',
    });
  } finally {
    clearTimeout(timer);
  }
}

/** @deprecated Prefer verifyVoiceGender(url, 'female') */
export async function verifyCallerFemaleVoice(userAudioUrl: string): Promise<VoiceGenderVerificationResult> {
  return verifyVoiceGender(userAudioUrl, 'female');
}

export function voiceGenderThreshold(expectedGender: ExpectedVoiceGender): number {
  return minConfidenceForExpectedGender(expectedGender);
}

export function getVoiceVerificationMode(): 'required' | 'disabled' {
  return readVerificationMode();
}
