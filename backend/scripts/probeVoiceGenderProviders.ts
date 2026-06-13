import '../config/bootstrapEnv';
import fs from 'fs';
import path from 'path';
import { HfInference } from '@huggingface/inference';

async function probeUrl(label: string, url: string, token: string, bytes: Buffer): Promise<void> {
  const rsp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
    },
    body: bytes,
  });
  const text = await rsp.text();
  console.log(`\n=== ${label} ===`);
  console.log('status:', rsp.status);
  console.log('body:', text.slice(0, 500));
}

async function main(): Promise<void> {
  const token = (process.env.HF_API_TOKEN ?? '').trim();
  if (!token) {
    console.error('HF_API_TOKEN missing');
    process.exit(1);
  }
  const bytes = fs.readFileSync(
    path.resolve(__dirname, '../../frontend/assets/sounds/receiver_ringtone.mp3')
  );
  const hf = new HfInference(token);

  await probeUrl(
    'router audeering',
    'https://router.huggingface.co/hf-inference/models/audeering/wav2vec2-large-robust-24-ft-age-gender',
    token,
    bytes
  );
  await probeUrl(
    'router alefiury',
    'https://router.huggingface.co/hf-inference/models/alefiury/wav2vec2-large-xlsr-53-gender-recognition-librispeech',
    token,
    bytes
  );

  for (const provider of ['hf-inference', 'replicate', 'fal-ai'] as const) {
    try {
      const result = await hf.audioClassification({
        model: 'alefiury/wav2vec2-large-xlsr-53-gender-recognition-librispeech',
        data: new Uint8Array(bytes),
        provider,
      });
      console.log(`\n=== SDK audioClassification (${provider}) ===`);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`\n=== SDK audioClassification (${provider}) FAILED ===`);
      console.log(msg);
    }
  }
}

main();
