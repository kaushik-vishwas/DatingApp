import jwt from 'jsonwebtoken';
import crypto from 'crypto';

type AccountKind = 'user' | 'receiver';

const STREAM_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

function getStreamConfig(): { apiKey: string; apiSecret: string } {
  const apiKey = (process.env.STREAM_API_KEY ?? '').trim();
  const apiSecret = (process.env.STREAM_API_SECRET ?? '').trim();
  if (!apiKey || !apiSecret) {
    throw new Error('Stream is not configured on server');
  }
  return { apiKey, apiSecret };
}

export function toStreamUserId(accountKind: AccountKind, accountId: string): string {
  return `${accountKind === 'user' ? 'u' : 'r'}_${accountId}`;
}

export function createStreamUserToken(streamUserId: string): { token: string; expiresAt: string } {
  const { apiSecret } = getStreamConfig();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + STREAM_TOKEN_TTL_SECONDS;
  const token = jwt.sign(
    {
      user_id: streamUserId,
      iat: now,
      exp,
    },
    apiSecret,
    { algorithm: 'HS256' }
  );
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

export function getStreamApiKey(): string {
  return getStreamConfig().apiKey;
}

export function buildVoiceCallId(a: string, b: string): string {
  const [left, right] = [a, b].sort();
  // Stream call IDs must stay <= 64 chars; keep compact while preserving uniqueness.
  const pairHash = crypto.createHash('sha1').update(`${left}|${right}`).digest('hex').slice(0, 12);
  const nonce = crypto.randomBytes(8).toString('hex');
  return `v_${pairHash}_${nonce}`;
}
