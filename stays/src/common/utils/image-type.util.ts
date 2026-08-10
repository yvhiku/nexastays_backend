/**
 * Detect image type from magic bytes (file signature).
 * SVG is explicitly rejected (not in allowlist; XSS vector if served inline).
 */
export function detectImageType(
  buffer: Buffer,
): 'jpeg' | 'png' | 'webp' | null {
  if (!buffer || buffer.length < 5) return null;
  const head = buffer
    .subarray(0, Math.min(256, buffer.length))
    .toString('utf8')
    .trimStart()
    .toLowerCase();
  if (
    head.startsWith('<svg') ||
    (head.startsWith('<?xml') && head.includes('<svg'))
  ) {
    return null;
  }
  if (buffer.length < 12) return null;
  const b = buffer;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return 'png';
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return 'webp';
  return null;
}

export const ALLOWED_IMAGE_TYPES = ['jpeg', 'png', 'webp'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];
