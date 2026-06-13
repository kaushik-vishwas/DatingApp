/**
 * POST voice audio to Hugging Face inference and print ONLY the HF API response.
 *
 * Usage:
 *   npm run test:voice-gender-api -- --url "https://res.cloudinary.com/.../voice.mp4"
 *   npm run test:voice-gender-api -- --file "C:\path\to\recording.m4a"
 *
 * Env (backend/.env): HF_API_TOKEN, optional HF_VOICE_GENDER_MODEL_ID
 */
import '../config/bootstrapEnv';
import fs from 'fs';
import path from 'path';

function usage(): never {
  console.error(`Usage:
  npm run test:voice-gender-api -- --url <https-audio-url>
  npm run test:voice-gender-api -- --file <local-audio-path>`);
  process.exit(1);
}

function readArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function loadAudioBytes(): Promise<{ bytes: ArrayBuffer; source: string }> {
  const url = readArg('--url');
  const file = readArg('--file');

  if (url && file) {
    console.error('Pass only one of --url or --file');
    usage();
  }
  if (url) {
    const rsp = await fetch(url, { method: 'GET' });
    if (!rsp.ok) {
      console.error(JSON.stringify({ error: 'audio_fetch_failed', httpStatus: rsp.status, source: url }, null, 2));
      process.exit(1);
    }
    return { bytes: await rsp.arrayBuffer(), source: url };
  }
  if (file) {
    const resolved = path.resolve(file);
    if (!fs.existsSync(resolved)) {
      console.error(JSON.stringify({ error: 'file_not_found', path: resolved }, null, 2));
      process.exit(1);
    }
    const buf = fs.readFileSync(resolved);
    return { bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), source: resolved };
  }
  usage();
}

async function main(): Promise<void> {
  const hfToken = (process.env.HF_API_TOKEN ?? '').trim();
  if (!hfToken) {
    console.error(JSON.stringify({ error: 'HF_API_TOKEN missing in backend/.env' }, null, 2));
    process.exit(1);
  }

  const modelId =
    (process.env.HF_VOICE_GENDER_MODEL_ID ?? '').trim() ||
    'audeering/wav2vec2-large-robust-24-ft-age-gender';
  const endpoint = `https://router.huggingface.co/hf-inference/models/${modelId}`;
  const timeoutMs = Number(process.env.VOICE_GENDER_TIMEOUT_MS) || 20000;

  const { bytes, source } = await loadAudioBytes();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  try {
    const rsp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hfToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: bytes,
      signal: controller.signal,
    });

    const contentType = rsp.headers.get('content-type') ?? '';
    let body: unknown;
    const text = await rsp.text();
    if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    } else {
      body = text;
    }

    // Only Hugging Face API outcome — no app/backend interpretation.
    console.log(
      JSON.stringify(
        {
          huggingFace: {
            endpoint,
            modelId,
            audioSource: source,
            audioBytes: bytes.byteLength,
            httpStatus: rsp.status,
            ok: rsp.ok,
            body,
          },
        },
        null,
        2
      )
    );
    process.exit(rsp.ok ? 0 : 1);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(
      JSON.stringify(
        {
          huggingFace: {
            endpoint,
            modelId,
            audioSource: source,
            audioBytes: bytes.byteLength,
            httpStatus: null,
            ok: false,
            body: { error: message },
          },
        },
        null,
        2
      )
    );
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

main();
