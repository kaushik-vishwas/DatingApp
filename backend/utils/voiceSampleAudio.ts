import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const MIN_DURATION_SEC = 8;
const MAX_DURATION_SEC = 45;
const MIN_MAX_VOLUME_DB = -30;
const MIN_MEAN_VOLUME_DB = -38;
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;

export const VOICE_SAMPLE_REJECTED_MESSAGE =
  "The mic didn't hear the paragraph. Please record again.";

function isCloudinaryUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com';
  } catch {
    return false;
  }
}

function resolveFfmpeg(): string {
  try {
    const bin = require('ffmpeg-static') as string | null;
    if (typeof bin === 'string' && bin.trim() && fs.existsSync(bin)) return bin;
  } catch {
    // Fall back to ffmpeg on PATH when the bundled binary is absent.
  }
  return 'ffmpeg';
}

function durationSeconds(stderr: string): number | null {
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function run(bin: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${bin} timed out`));
    }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new Error(`${bin} is not installed`));
        return;
      }
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function parseDb(raw: string | undefined): number | null {
  if (!raw) return null;
  if (raw.toLowerCase() === '-inf') return Number.NEGATIVE_INFINITY;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function downloadToTemp(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  if (!res.ok || !isCloudinaryUrl(res.url || url)) {
    throw new Error(VOICE_SAMPLE_REJECTED_MESSAGE);
  }
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_DOWNLOAD_BYTES) throw new Error(VOICE_SAMPLE_REJECTED_MESSAGE);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_DOWNLOAD_BYTES) {
    throw new Error(VOICE_SAMPLE_REJECTED_MESSAGE);
  }
  const file = path.join(os.tmpdir(), `voice-sample-${Date.now()}-${Math.random().toString(16).slice(2)}.m4a`);
  await fs.promises.writeFile(file, bytes);
  return file;
}

/**
 * Returns the user-facing rejection message, or null when the file is an audible voice sample.
 * Duration, audio type, and volume all come from one ffmpeg run. ffprobe is not required.
 * Throws when ffmpeg cannot be run.
 */
export async function voiceSampleRejectionMessage(url: string): Promise<string | null> {
  if (!isCloudinaryUrl(url)) return VOICE_SAMPLE_REJECTED_MESSAGE;

  let file = '';
  try {
    file = await downloadToTemp(url);
    const levels = await run(
      resolveFfmpeg(),
      ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
      20_000
    );
    const hasAudio = /Stream #\d+:\d+.*?:\s*Audio:/i.test(levels.stderr);
    const durationSec = durationSeconds(levels.stderr);
    if (!hasAudio || durationSec == null || durationSec < MIN_DURATION_SEC || durationSec > MAX_DURATION_SEC) {
      return VOICE_SAMPLE_REJECTED_MESSAGE;
    }
    const maxVolume = parseDb(levels.stderr.match(/max_volume:\s*(-?[\d.]+|-inf)\s*dB/i)?.[1]);
    const meanVolume = parseDb(levels.stderr.match(/mean_volume:\s*(-?[\d.]+|-inf)\s*dB/i)?.[1]);
    if (maxVolume == null || meanVolume == null || maxVolume < MIN_MAX_VOLUME_DB || meanVolume < MIN_MEAN_VOLUME_DB) {
      return VOICE_SAMPLE_REJECTED_MESSAGE;
    }
    return null;
  } catch (err) {
    if (err instanceof Error && err.message === VOICE_SAMPLE_REJECTED_MESSAGE) return err.message;
    throw err;
  } finally {
    if (file) await fs.promises.unlink(file).catch(() => {});
  }
}
