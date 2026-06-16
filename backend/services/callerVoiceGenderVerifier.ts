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

function minConfidenceForExpectedGender(expectedGender: ExpectedVoiceGender): number {
  if (expectedGender === 'female') {
    return asNumber(process.env.VOICE_GENDER_FEMALE_MIN_CONFIDENCE) ?? 0.7;
  }
  if (expectedGender === 'male') {
    return asNumber(process.env.VOICE_GENDER_MALE_MIN_CONFIDENCE) ?? 0.7;
  }
  return 0;
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
      reason:
        'HF Inference has no supported audio-classification endpoint for gender models; using local Transformers.js',
      audioUrl: userAudioUrl,
      expectedGender,
    });
  }

  const { classifyVoiceGenderLocally } = await import('./voiceGenderLocalClassifier');
  return classifyVoiceGenderLocally(userAudioUrl, expectedGender);
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
