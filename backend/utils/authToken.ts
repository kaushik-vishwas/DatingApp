import jwt from 'jsonwebtoken';

export type AppJwtPayload = { id: string; typ: 'u' | 'r'; sv?: number };

export function signAppAccessToken(userId: string, typ: 'u' | 'r', sessionVersion: number): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set in environment');
  }
  const sv = Math.floor(sessionVersion);
  return jwt.sign({ id: userId, typ, sv } satisfies AppJwtPayload, secret, { expiresIn: '7d' });
}

/** Tokens issued before session versioning use implicit sv 0. */
export function getPayloadSessionVersion(payload: AppJwtPayload): number {
  return typeof payload.sv === 'number' && Number.isFinite(payload.sv) ? payload.sv : 0;
}
