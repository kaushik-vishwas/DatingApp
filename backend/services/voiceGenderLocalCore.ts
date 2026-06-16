import type { ExpectedVoiceGender, VoiceGenderVerificationResult } from './callerVoiceGenderVerifier';
import { loadVoiceAudioSamples } from './voiceGenderAudioLoader';

type VoiceGenderLabel = 'female' | 'male' | 'other' | 'unknown';
type ClassificationRow = { label: string; score: number };

const LOCAL_MODEL_ID =
  process.env.VOICE_GENDER_LOCAL_MODEL_ID?.trim() ||
  'Xenova/wav2vec2-large-xlsr-53-gender-recognition-librispeech';

function localModelDtype(): 'q4' | 'q8' | 'fp32' {
  const raw = (process.env.VOICE_GENDER_LOCAL_DTYPE ?? 'q4').trim().toLowerCase();
  if (raw === 'q8') return 'q8';
  if (raw === 'fp32' || raw === 'float32') return 'fp32';
  return 'q4';
}

let pipelinePromise: Promise<
  (input: Float32Array, options?: Record<string, unknown>) => Promise<ClassificationRow[]>
> | null = null;

function asNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeLabel(raw: unknown): VoiceGenderLabel {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (v.includes('female') || v === 'f') return 'female';
  if (v.includes('male') || v === 'm') return 'male';
  if (v.includes('other') || v.includes('non') || v.includes('child')) return 'other';
  return 'unknown';
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

function pickTopPrediction(
  rows: ClassificationRow[]
): { predictedGender: VoiceGenderLabel; confidence: number } {
  let topLabel: VoiceGenderLabel = 'unknown';
  let topScore = 0;

  for (const row of rows) {
    const label = normalizeLabel(row.label);
    if (label !== 'female' && label !== 'male') continue;
    const score = Math.max(0, Math.min(1, asNumber(row.score) ?? 0));
    if (score > topScore) {
      topScore = score;
      topLabel = label;
    }
  }

  return { predictedGender: topLabel, confidence: topScore };
}

async function getClassifier(): Promise<
  (input: Float32Array, options?: Record<string, unknown>) => Promise<ClassificationRow[]>
> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      if (env?.backends?.onnx?.wasm) {
        env.backends.onnx.wasm.numThreads = 1;
      }
      const dtype = localModelDtype();
      console.log('[voice-gender-local] loading model', { model: LOCAL_MODEL_ID, dtype });
      const pipe = await pipeline('audio-classification', LOCAL_MODEL_ID, {
        dtype,
        device: 'cpu',
      });
      return pipe as (
        input: Float32Array,
        options?: Record<string, unknown>
      ) => Promise<ClassificationRow[]>;
    })();
  }
  return pipelinePromise;
}

export async function warmVoiceGenderModel(): Promise<void> {
  await getClassifier();
}

export async function classifyVoiceGenderLocallyCore(
  audioSource: string,
  expectedGender: ExpectedVoiceGender
): Promise<VoiceGenderVerificationResult> {
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
    const samples = await loadVoiceAudioSamples(audioSource);
    const raw = (await classifier(samples, { topk: 5 })) as ClassificationRow[];
    const { predictedGender, confidence } = pickTopPrediction(raw);

    console.log(
      '[voice-gender-local]',
      JSON.stringify(
        {
          model: LOCAL_MODEL_ID,
          audioSource,
          expectedGender,
          raw,
          predictedGender,
          confidence,
          threshold: minConfidence,
        },
        null,
        2
      )
    );

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
  } catch (err) {
    let msg = err instanceof Error ? err.message : String(err);
    if (/cannot find module '@huggingface\/transformers'/i.test(msg)) {
      msg =
        'Voice AI package missing on server. Run: cd backend && npm install && npm run build && pm2 restart selecto-backend';
    }
    console.log(
      '[voice-gender-local]',
      JSON.stringify({ model: LOCAL_MODEL_ID, audioSource, expectedGender, error: msg }, null, 2)
    );
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
