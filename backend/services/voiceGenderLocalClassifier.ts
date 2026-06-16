import { fork, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { ExpectedVoiceGender, VoiceGenderVerificationResult } from './callerVoiceGenderVerifier';

let classifyTail: Promise<void> = Promise.resolve();

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Keep heavy Transformers.js model out of the API process (default: on). */
export function shouldUseVoiceGenderWorker(): boolean {
  const raw = asString(process.env.VOICE_GENDER_USE_WORKER).toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off') return false;
  return true;
}

export function voiceGenderWorkerScriptPath(): string {
  return path.join(__dirname, 'voiceGenderWorkerProcess.js');
}

async function withLocalClassifyLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = classifyTail;
  let release!: () => void;
  classifyTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function classifyViaWorker(
  audioSource: string,
  expectedGender: ExpectedVoiceGender
): Promise<VoiceGenderVerificationResult> {
  const workerScript = voiceGenderWorkerScriptPath();
  const timeoutMs = Math.max(
    120_000,
    Number(process.env.VOICE_GENDER_TIMEOUT_MS ?? 120000) || 120_000
  );
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve) => {
    let settled = false;
    let child: ChildProcess | null = null;

    const finish = (result: VoiceGenderVerificationResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child && !child.killed) {
        child.kill('SIGTERM');
      }
      resolve(result);
    };

    if (!fs.existsSync(workerScript)) {
      finish({
        ok: false,
        predictedGender: 'unknown',
        confidence: 0,
        model: 'voice-gender-worker',
        failureKind: 'misconfigured',
        reason: `Voice worker not deployed (${workerScript}). Run npm run build on server.`,
      });
      return;
    }

    try {
      child = fork(workerScript, [], {
        env: process.env,
        execArgv: ['--max-old-space-size=768'],
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      finish({
        ok: false,
        predictedGender: 'unknown',
        confidence: 0,
        model: 'voice-gender-worker',
        failureKind: 'service_unavailable',
        reason: `Could not start voice worker: ${msg}`,
      });
      return;
    }

    console.log('[voice-gender-worker] spawned', { pid: child.pid, script: workerScript });

    const onMessage = (msg: {
      id?: string;
      ok?: boolean;
      result?: VoiceGenderVerificationResult;
      error?: string;
    }) => {
      if (!msg || msg.id !== id) return;
      if (msg.ok && msg.result) {
        finish(msg.result);
        return;
      }
      finish({
        ok: false,
        predictedGender: 'unknown',
        confidence: 0,
        model: 'voice-gender-worker',
        failureKind: 'service_unavailable',
        reason: msg.error || 'Voice verification worker failed',
      });
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      const oom = signal === 'SIGKILL' || signal === 'SIGABRT';
      finish({
        ok: false,
        predictedGender: 'unknown',
        confidence: 0,
        model: 'voice-gender-worker',
        failureKind: 'service_unavailable',
        reason: oom
          ? 'Voice verification ran out of memory on server. Add 2G swap on EC2, then retry.'
          : `Voice verification worker exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
      });
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        predictedGender: 'unknown',
        confidence: 0,
        model: 'voice-gender-worker',
        failureKind: 'service_unavailable',
        reason: 'Voice verification timed out on server',
      });
    }, timeoutMs);

    child.on('message', onMessage);
    child.once('exit', onExit);
    child.on('error', (err) => {
      console.error('[voice-gender-worker] error', err);
      finish({
        ok: false,
        predictedGender: 'unknown',
        confidence: 0,
        model: 'voice-gender-worker',
        failureKind: 'service_unavailable',
        reason: err.message,
      });
    });

    child.send({ id, audioSource, expectedGender });
  });
}

export async function warmVoiceGenderWorkerInBackground(): Promise<void> {
  if (!shouldUseVoiceGenderWorker()) return;
  const workerScript = voiceGenderWorkerScriptPath();
  if (!fs.existsSync(workerScript)) {
    console.warn('[voice-gender-worker] warmup skipped — script missing:', workerScript);
    return;
  }
  await new Promise<void>((resolve) => {
    const id = `warmup-${Date.now()}`;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (child && !child.killed) child.kill('SIGTERM');
      resolve();
    };
    let child: ChildProcess | null = null;
    try {
      child = fork(workerScript, [], {
        env: process.env,
        execArgv: ['--max-old-space-size=768'],
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      });
    } catch (err) {
      console.warn('[voice-gender-worker] warmup spawn failed:', err);
      finish();
      return;
    }
    const timer = setTimeout(() => {
      console.warn('[voice-gender-worker] warmup timed out');
      finish();
    }, 180_000);
    child.on('message', (msg: { id?: string; ok?: boolean }) => {
      if (!msg || msg.id !== id || !msg.ok) return;
      clearTimeout(timer);
      console.log('[voice-gender-worker] warmup complete', { pid: child?.pid });
      finish();
    });
    child.once('exit', () => {
      clearTimeout(timer);
      finish();
    });
    child.send({ id, warmup: true });
  });
}

export async function classifyVoiceGenderLocally(
  audioSource: string,
  expectedGender: ExpectedVoiceGender
): Promise<VoiceGenderVerificationResult> {
  return withLocalClassifyLock(async () => {
    if (shouldUseVoiceGenderWorker()) {
      return classifyViaWorker(audioSource, expectedGender);
    }
    const { classifyVoiceGenderLocallyCore } = await import('./voiceGenderLocalCore');
    return classifyVoiceGenderLocallyCore(audioSource, expectedGender);
  });
}
