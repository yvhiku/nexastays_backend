/**
 * Detect image type from magic bytes (file signature).
 * Never trust mimetype/extension alone for KYC uploads.
 */
export function detectImageType(
  buffer: Buffer,
): 'jpeg' | 'png' | 'webp' | null {
  if (!buffer || buffer.length < 12) return null;
  const b = buffer;
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
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
  // WebP: RIFF (0-3) .... WEBP (8-11)
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

export function mimetypeFromDetected(type: AllowedImageType): string {
  switch (type) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}
