export const MAX_PROOF_BYTES = 300 * 1024;

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export type ProofFormat = 'jpeg' | 'png' | 'webp' | 'pdf';

export const PROOF_FORMAT_LABELS: Record<ProofFormat, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  webp: 'WebP',
  pdf: 'PDF',
};

export const ACCEPTED_PROOF_FORMATS_LABEL = 'JPEG, PNG, WebP ou PDF';

export const PROOF_MIME_BY_FORMAT: Record<ProofFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

export const PROOF_EXTENSION_BY_FORMAT: Record<ProofFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  pdf: 'pdf',
};

export const PROOF_ACCEPT_ATTRIBUTE = '.jpg,.jpeg,.png,.webp,.pdf';

export const ACCEPTED_PROOF_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'pdf',
]);

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isAcceptedProofName(name: string): boolean {
  return ACCEPTED_PROOF_EXTENSIONS.has(fileExtension(name));
}

export function detectProofFormat(bytes: Uint8Array): ProofFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp';
  }
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'pdf';
  }
  return null;
}

export function formatKiloBytes(sizeBytes: number): string {
  return `${Math.max(1, Math.round(sizeBytes / 1024))} Ko`;
}
