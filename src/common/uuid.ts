import { ErrorFactory } from '@exceptions/ZintrustError';

export const generateUuid = (): string => {
  if (typeof globalThis?.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; // NOSONAR
};

export async function generateSecureJobId(
  errMsg: string = 'Secure crypto API not available to generate a job id.'
): Promise<string> {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }

  // Node fallback for environments without Web Crypto
  try {
    const nodeCrypto = await import('node:crypto');
    return nodeCrypto.randomBytes(16).toString('hex');
  } catch (error) {
    throw ErrorFactory.createTryCatchError(
      errMsg || 'Secure crypto API not available to generate a job id.',
      error
    );
  }
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}
