/**
 * Detect allowed video containers from magic bytes.
 * MP4/MOV typically start with size + 'ftyp' at offset 4.
 */
export function detectVideoType(
  buffer: Buffer,
): 'mp4' | 'webm' | null {
  if (!buffer || buffer.length < 12) return null;

  // ISO BMFF (mp4/m4v/mov): ....ftyp
  if (
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return 'mp4';
  }

  // WebM / Matroska: 0x1A45DFA3
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return 'webm';
  }

  return null;
}

export const ALLOWED_VIDEO_TYPES = ['mp4', 'webm'] as const;
export type AllowedVideoType = (typeof ALLOWED_VIDEO_TYPES)[number];
