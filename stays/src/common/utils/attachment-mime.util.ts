import { detectImageType } from './image-type.util';

const PDF_MAGIC = Buffer.from('%PDF');

export type AllowedAttachmentMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'
  | 'application/pdf';

const MIME_BY_DETECTED: Record<string, AllowedAttachmentMime> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function detectAttachmentMime(buffer: Buffer): AllowedAttachmentMime | null {
  if (!buffer?.length) return null;

  const imageType = detectImageType(buffer);
  if (imageType) return MIME_BY_DETECTED[imageType] ?? null;

  if (buffer.length >= 6 && buffer.subarray(0, 4).equals(PDF_MAGIC)) {
    return 'application/pdf';
  }

  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'image/gif';
  }

  return null;
}

export function extensionForMime(mime: AllowedAttachmentMime): string {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    case 'application/pdf':
      return '.pdf';
    default:
      return '.bin';
  }
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}
