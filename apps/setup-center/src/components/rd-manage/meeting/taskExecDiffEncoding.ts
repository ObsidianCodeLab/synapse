import type { TaskExecCodeDiffFile } from '../../../api/meetingRoomService';

export type DiffTextEncoding = 'utf-8' | 'gbk';

export const DIFF_TEXT_ENCODINGS: { value: DiffTextEncoding; label: string }[] = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'gbk', label: 'GBK' },
];

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function decodeDiffBase64(
  b64: string | undefined | null,
  encoding: DiffTextEncoding,
): string {
  if (!b64) return '';
  try {
    const bytes = base64ToBytes(b64);
    try {
      return new TextDecoder(encoding).decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  } catch {
    return '';
  }
}

export function decodeDiffFileText(
  file: TaskExecCodeDiffFile,
  encoding: DiffTextEncoding,
): { original: string; modified: string } {
  const hasOriginalB64 = Boolean(file.original_b64);
  const hasModifiedB64 = Boolean(file.modified_b64);

  if (hasOriginalB64 || hasModifiedB64) {
    const fromB64Original = hasOriginalB64 ? decodeDiffBase64(file.original_b64, encoding) : '';
    const fromB64Modified = hasModifiedB64 ? decodeDiffBase64(file.modified_b64, encoding) : '';
    return {
      original: fromB64Original || file.original || '',
      modified: fromB64Modified || file.modified || '',
    };
  }
  return {
    original: file.original || '',
    modified: file.modified || '',
  };
}
