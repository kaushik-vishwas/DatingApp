export const MAX_RANDOM_CALL_RETRIES = 3;

export function isRetryableRandomInviteError(message: string): boolean {
  const msg = message.toLowerCase();
  if (msg.includes('declined by receiver')) return false;
  return (
    msg.includes('offline') ||
    msg.includes('unavailable') ||
    msg.includes('busy') ||
    msg.includes('not available') ||
    msg.includes('cannot call this receiver')
  );
}
