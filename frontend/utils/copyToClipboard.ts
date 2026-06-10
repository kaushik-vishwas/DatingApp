import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';

/**
 * Android release builds often reject very large share intents / clip payloads.
 * Keep a conservative limit; callers can use Export for the full file.
 */
const SAFE_CLIPBOARD_CHARS = 512_000;

export type CopyToClipboardResult = {
  copiedChars: number;
  totalChars: number;
  truncated: boolean;
};

/**
 * Copy text to the system clipboard (works in release APK; unlike Share with huge messages).
 */
export async function copyTextToClipboard(text: string): Promise<CopyToClipboardResult> {
  const totalChars = text.length;
  if (!text.trim()) {
    throw new Error('No text to copy');
  }

  let payload = text;
  let truncated = false;
  if (payload.length > SAFE_CLIPBOARD_CHARS) {
    truncated = true;
    const tail = payload.slice(payload.length - SAFE_CLIPBOARD_CHARS);
    payload = `${tail}\n\n--- [truncated: last ${SAFE_CLIPBOARD_CHARS.toLocaleString()} of ${totalChars.toLocaleString()} chars; use Export logs for full file] ---`;
  }

  await Clipboard.setStringAsync(payload);

  if (__DEV__) {
    const readBack = await Clipboard.getStringAsync();
    if (!readBack || readBack.length < Math.min(payload.length, 32)) {
      throw new Error('Clipboard write could not be verified');
    }
  }

  return {
    copiedChars: payload.length,
    totalChars,
    truncated,
  };
}

export function copySuccessMessage(result: CopyToClipboardResult): string {
  if (result.truncated) {
    return `Copied the most recent ${SAFE_CLIPBOARD_CHARS.toLocaleString()} characters (${result.totalChars.toLocaleString()} total). Use Export logs for the full file.`;
  }
  const where = Platform.OS === 'ios' ? 'clipboard' : 'clipboard';
  return `Copied ${result.copiedChars.toLocaleString()} characters to ${where}.`;
}
