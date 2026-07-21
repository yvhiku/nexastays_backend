import { detectImageType } from './image-type.util';

const PDF_MAGIC = Buffer.from('%PDF');

export type AllowedAttachmentMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'
  | 'application/pdf'
  | 'audio/webm'
  | 'audio/ogg'
  | 'audio/mp4'
  | 'audio/mpeg';

const MIME_BY_DETECTED: Record<string, AllowedAttachmentMime> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function detectAudioMime(buffer: Buffer): AllowedAttachmentMime | null {
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf) {
    return 'audio/webm';
  }
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OggS') {
    return 'audio/ogg';
  }
  if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return 'audio/mp4';
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0x49 &&
    buffer[1] === 0x44 &&
    buffer[2] === 0x33
  ) {
    return 'audio/mpeg';
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }
  return null;
}

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

  return detectAudioMime(buffer);
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
    case 'audio/webm':
      return '.webm';
    case 'audio/ogg':
      return '.ogg';
    case 'audio/mp4':
      return '.m4a';
    case 'audio/mpeg':
      return '.mp3';
    default:
      return '.bin';
  }
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}

export function isAudioMime(mime: string): boolean {
  return mime.startsWith('audio/');
}
