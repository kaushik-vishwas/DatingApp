type VoiceGenderLabel = 'female' | 'male' | 'other' | 'unknown';

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
  const lower = reason.toLowerCase();
  if (lower.includes('not supported')) return true;
  if (lower.includes('returned http 404')) return true;
  if (lower.includes('returned http 503')) return true;
  const raw = asString(process.env.VOICE_GENDER_HF_FALLBACK_TO_LOCAL).toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off') return false;
  return process.env.NODE_ENV !== 'production';
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

function parseResponseBody(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

function logHuggingFaceApiResponse(input: {
  endpoint: string;
  modelId: string;
  audioUrl: string;
  audioBytes: number;
  httpStatus: number;
  ok: boolean;
  body: unknown;
}): void {
  logVoiceGenderTerminal('voice-gender-hf', {
    huggingFace: input,
  });
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

  const modelId =
    asString(process.env.HF_VOICE_GENDER_MODEL_ID) || 'audeering/wav2vec2-large-robust-24-ft-age-gender';
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

  const fetchImpl = (globalThis as { fetch?: unknown }).fetch;
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
    const audioFetch = await (
      fetchImpl as (input: string, init?: Record<string, unknown>) => Promise<{
        ok: boolean;
        status: number;
        arrayBuffer: () => Promise<ArrayBuffer>;
      }>
    )(userAudioUrl, { method: 'GET', signal: controller.signal });
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

    const rsp = await (
      fetchImpl as (input: string, init?: Record<string, unknown>) => Promise<{
        ok: boolean;
        status: number;
        text: () => Promise<string>;
      }>
    )(endpoint, {
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
        const errBody = body as Record<string, unknown>;
        details = asString(errBody.error) || asString(errBody.message);
      } else if (typeof body === 'string') {
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
        const { classifyVoiceGenderLocally } = await import('./voiceGenderLocalClassifier');
        return classifyVoiceGenderLocally(userAudioUrl, expectedGender);
      }
      return failed;
    }

    const errorMsg =
      body && typeof body === 'object' && !Array.isArray(body)
        ? asString((body as Record<string, unknown>).error)
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
        const { classifyVoiceGenderLocally } = await import('./voiceGenderLocalClassifier');
        return classifyVoiceGenderLocally(userAudioUrl, expectedGender);
      }
      return failed;
    }

    let predictedGender: VoiceGenderLabel = 'unknown';
    let confidence = 0;
    if (Array.isArray(body)) {
      const first = body[0];
      if (Array.isArray(first)) {
        const top = pickTopFromScores(first as Array<Record<string, unknown>>);
        predictedGender = top.label;
        confidence = top.score;
      } else {
        const top = pickTopFromScores(body as Array<Record<string, unknown>>);
        predictedGender = top.label;
        confidence = top.score;
      }
    } else if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      const labels = Array.isArray(obj.labels) ? obj.labels : [];
      const scores = Array.isArray(obj.scores) ? obj.scores : [];
      const rows: Array<Record<string, unknown>> = [];
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
  } catch (err) {
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
