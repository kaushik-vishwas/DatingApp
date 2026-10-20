import type { NextFunction, Request, Response } from 'express';
import Receiver, { type ReceiverLastClient } from '../models/Receiver';
import { APP_VERSION_HEADER, parseAppVersionCode } from './appVersionGate';

export const DEVICE_HEADER = 'x-device';

/** Normal app traffic refreshes the stored device at most once a day (or when it changes). */
const LAST_CLIENT_REFRESH_MS = 24 * 60 * 60 * 1000;
/** Ring acks refresh it hourly so ring events always carry a recent device. */
export const LAST_CLIENT_RING_REFRESH_MS = 60 * 60 * 1000;

const MAX_FIELD_LENGTH = 60;

function cleanField(value: string | undefined): string {
  return String(value ?? '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, MAX_FIELD_LENGTH);
}

/** Parses "mfr=Xiaomi; model=Redmi Note 12; os=14; sdk=34" + X-App-Version. Null when absent. */
export function parseClientInfo(req: Request): Omit<ReceiverLastClient, 'seenAt'> | null {
  const raw = req.headers[DEVICE_HEADER];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (typeof header !== 'string' || !header.trim()) return null;
  const parts: Record<string, string> = {};
  for (const piece of header.slice(0, 200).split(';')) {
    const eq = piece.indexOf('=');
    if (eq <= 0) continue;
    parts[piece.slice(0, eq).trim().toLowerCase()] = piece.slice(eq + 1);
  }
  const sdk = Number(parts.sdk);
  return {
    mfr: cleanField(parts.mfr),
    model: cleanField(parts.model),
    os: cleanField(parts.os),
    sdk: Number.isFinite(sdk) && sdk > 0 ? Math.floor(sdk) : null,
    appVersionCode: parseAppVersionCode(req.headers[APP_VERSION_HEADER]),
  };
}

function signature(info: Omit<ReceiverLastClient, 'seenAt'>): string {
  return [info.mfr, info.model, info.os, info.sdk ?? '', info.appVersionCode ?? ''].join('|');
}

/** receiverId → last write attempt (this process) so busy request streams skip the DB entirely. */
const recentWrites = new Map<string, { sig: string; at: number }>();
const MAX_TRACKED = 20_000;

/**
 * Stores the receiver's device when it is missing, changed, or older than [maxAgeMs].
 * Best-effort: never throws.
 */
export async function recordReceiverLastClient(
  receiverId: string,
  info: Omit<ReceiverLastClient, 'seenAt'>,
  maxAgeMs: number = LAST_CLIENT_REFRESH_MS
): Promise<void> {
  const id = String(receiverId).trim();
  if (!id) return;
  const sig = signature(info);
  const now = Date.now();
  const prev = recentWrites.get(id);
  if (prev && prev.sig === sig && now - prev.at < maxAgeMs) return;
  if (recentWrites.size >= MAX_TRACKED) recentWrites.clear();
  recentWrites.set(id, { sig, at: now });
  try {
    await Receiver.updateOne(
      {
        _id: id,
        $or: [
          { lastClient: null },
          { 'lastClient.seenAt': { $lt: new Date(now - maxAgeMs) } },
          { 'lastClient.mfr': { $ne: info.mfr } },
          { 'lastClient.model': { $ne: info.model } },
          { 'lastClient.os': { $ne: info.os } },
          { 'lastClient.appVersionCode': { $ne: info.appVersionCode } },
        ],
      },
      { $set: { lastClient: { ...info, seenAt: new Date(now) } } }
    );
  } catch (err) {
    console.warn('recordReceiverLastClient failed', {
      receiverId: id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Never blocks a request: after the response, remembers the signed-in receiver's device. */
export function trackClientInfo(req: Request, res: Response, next: NextFunction): void {
  const info = parseClientInfo(req);
  if (info) {
    res.on('finish', () => {
      if (req.accountKind !== 'receiver' || !req.receiver?._id) return;
      void recordReceiverLastClient(String(req.receiver._id), info);
    });
  }
  next();
}
