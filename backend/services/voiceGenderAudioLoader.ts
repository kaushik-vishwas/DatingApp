import fs from 'fs/promises';
import { WaveFile } from 'wavefile';

const TARGET_SAMPLE_RATE = 16000;

function isHttpUrl(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

/** Ask Cloudinary to deliver WAV (works for uploaded m4a/mp3 voice samples). */
export function cloudinaryWavUrl(url: string): string {
  if (!/res\.cloudinary\.com/i.test(url) || !/\/upload\//i.test(url)) return url;
  if (/\/upload\/(?:[^/]+\/)*f_wav(?:[_,/]|$)/i.test(url)) return url;
  return url.replace('/upload/', '/upload/f_wav/');
}

async function loadAudioBytes(source: string): Promise<Buffer> {
  if (isHttpUrl(source)) {
    const rsp = await fetch(source, { method: 'GET' });
    if (!rsp.ok) {
      throw new Error(`Could not fetch audio URL (HTTP ${rsp.status})`);
    }
    return Buffer.from(await rsp.arrayBuffer());
  }
  return fs.readFile(source);
}

function wavBufferToSamples(buffer: Buffer): Float32Array {
  const wav = new WaveFile(buffer);
  wav.toBitDepth('32f');
  wav.toSampleRate(TARGET_SAMPLE_RATE);
  const samples = wav.getSamples();
  const channel = Array.isArray(samples) ? samples[0] : samples;
  if (channel instanceof Float32Array) return channel;
  return Float32Array.from(channel as ArrayLike<number>);
}

/** Decode voice audio from Cloudinary HTTPS URL or local .wav path into 16kHz mono Float32Array. */
export async function loadVoiceAudioSamples(source: string): Promise<Float32Array> {
  const fetchSource = isHttpUrl(source) ? cloudinaryWavUrl(source) : source;
  const bytes = await loadAudioBytes(fetchSource);
  try {
    return wavBufferToSamples(bytes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not decode voice audio as WAV: ${msg}`);
  }
}
