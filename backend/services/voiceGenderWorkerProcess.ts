import '../config/bootstrapEnv';
import type { ExpectedVoiceGender, VoiceGenderVerificationResult } from './callerVoiceGenderVerifier';
import { classifyVoiceGenderLocallyCore } from './voiceGenderLocalCore';

type WorkerRequest = {
  id: string;
  audioSource: string;
  expectedGender: ExpectedVoiceGender;
};

type WorkerResponse =
  | { id: string; ok: true; result: VoiceGenderVerificationResult }
  | { id: string; ok: false; error: string };

process.on('message', (msg: WorkerRequest) => {
  void (async () => {
    try {
      const result = await classifyVoiceGenderLocallyCore(msg.audioSource, msg.expectedGender);
      const out: WorkerResponse = { id: msg.id, ok: true, result };
      process.send?.(out);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const out: WorkerResponse = { id: msg.id, ok: false, error };
      process.send?.(out);
    }
  })();
});

process.on('uncaughtException', (err) => {
  console.error('[voice-gender-worker] uncaughtException:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('[voice-gender-worker] unhandledRejection:', err);
  process.exit(1);
});
