import { fork, type ChildProcess } from 'child_process';
import path from 'path';
import type { ExpectedVoiceGender, VoiceGenderVerificationResult } from './callerVoiceGenderVerifier';
import { classifyVoiceGenderLocallyCore } from './voiceGenderLocalCore';

let classifyTail: Promise<void> = Promise.resolve();
let workerChild: ChildProcess | null = null;

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function shouldUseWorkerProcess(): boolean {
  const raw = asString(process.env.VOICE_GENDER_USE_WORKER).toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'on') return true;
  if (raw === 'false' || raw === '0' || raw === 'off') return false;
  return process.env.NODE_ENV === 'production';
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

function workerScriptPath(): string {
  return path.join(__dirname, 'voiceGenderWorkerProcess.js');
}

function resetWorkerChild(): void {
  if (workerChild && !workerChild.killed) {
    workerChild.kill('SIGTERM');
  }
  workerChild = null;
}

function spawnWorkerChild(): ChildProcess {
  const child = fork(workerScriptPath(), [], {
    env: process.env,
    execArgv: ['--max-old-space-size=768'],
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });
  child.on('exit', () => {
    if (workerChild === child) {
      workerChild = null;
    }
  });
  workerChild = child;
  return child;
}

function classifyViaWorker(
  audioSource: string,
  expectedGender: ExpectedVoiceGender
): Promise<VoiceGenderVerificationResult> {
  const timeoutMs = Number(process.env.VOICE_GENDER_TIMEOUT_MS ?? 120000);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve) => {
    const child = workerChild && !workerChild.killed ? workerChild : spawnWorkerChild();

    const finish = (result: VoiceGenderVerificationResult) => {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
      resolve(result);
    };

    const onMessage = (msg: { id?: string; ok?: boolean; result?: VoiceGenderVerificationResult; error?: string }) => {
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
      resetWorkerChild();
      const oom = signal === 'SIGKILL' || signal === 'SIGABRT';
      finish({
        ok: false,
        predictedGender: 'unknown',
        confidence: 0,
        model: 'voice-gender-worker',
        failureKind: 'service_unavailable',
        reason: oom
          ? 'Voice verification ran out of memory on server. Add swap or upgrade EC2 RAM, then retry.'
          : `Voice verification worker exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
      });
    };

    const timer = setTimeout(() => {
      resetWorkerChild();
      finish({
        ok: false,
        predictedGender: 'unknown',
        confidence: 0,
        model: 'voice-gender-worker',
        failureKind: 'service_unavailable',
        reason: 'Voice verification timed out on server',
      });
    }, Math.max(30_000, timeoutMs));

    child.on('message', onMessage);
    child.once('exit', onExit);

    child.send({ id, audioSource, expectedGender });
  });
}

export async function classifyVoiceGenderLocally(
  audioSource: string,
  expectedGender: ExpectedVoiceGender
): Promise<VoiceGenderVerificationResult> {
  return withLocalClassifyLock(async () => {
    if (shouldUseWorkerProcess()) {
      return classifyViaWorker(audioSource, expectedGender);
    }
    return classifyVoiceGenderLocallyCore(audioSource, expectedGender);
  });
}
