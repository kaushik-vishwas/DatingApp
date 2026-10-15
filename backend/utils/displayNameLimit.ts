export const DISPLAY_NAME_MAX_LENGTH = 25;

export function displayNameTooLongMessage(raw: string): string | null {
  const name = String(raw).trim().replace(/ {2,}/g, ' ');
  if (name.length > DISPLAY_NAME_MAX_LENGTH) {
    return 'Display name can be at most 25 characters.';
  }
  return null;
}
