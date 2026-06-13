import fs from 'fs/promises';
import decodeAudio from 'audio-decode';

const TARGET_SAMPLE_RATE = 16000;

function isHttpUrl(source: string): boolean {
  return /^https?:\/\//i.test(source);
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

function mixToMono(channelData: Float32Array[]): Float32Array {
  if (channelData.length === 1) return channelData[0]!;
  const length = channelData[0]?.length ?? 0;
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    for (const channel of channelData) {
      sum += channel[i] ?? 0;
    }
    mono[i] = sum / channelData.length;
  }
  return mono;
}

function resampleTo16k(input: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === TARGET_SAMPLE_RATE) return input;
  const outputLength = Math.max(1, Math.round((input.length * TARGET_SAMPLE_RATE) / inputSampleRate));
  const output = new Float32Array(outputLength);
  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio;
    const index = Math.floor(position);
    const next = Math.min(index + 1, input.length - 1);
    const weight = position - index;
    output[i] = (input[index] ?? 0) * (1 - weight) + (input[next] ?? 0) * weight;
  }
  return output;
}

/** Decode mp3/m4a/wav from HTTPS URL or local path into 16kHz mono Float32Array. */
export async function loadVoiceAudioSamples(source: string): Promise<Float32Array> {
  const bytes = await loadAudioBytes(source);
  const decoded = await decodeAudio(bytes);
  const channelData = decoded.channelData;
  if (!channelData?.length) {
    throw new Error('Decoded audio has no channel data');
  }
  const mono = mixToMono(channelData);
  return resampleTo16k(mono, decoded.sampleRate || TARGET_SAMPLE_RATE);
}
