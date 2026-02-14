import type { IncomingMessage } from '@node-singletons/http';
import type { ProxySigningConfig } from '@proxy/ProxyConfig';
import { SigningService } from '@proxy/SigningService';

export const normalizeHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value.join(',');
  return value;
};

export const extractSigningHeaders = (
  req: IncomingMessage
): Record<string, string | undefined> => ({
  'x-zt-key-id': normalizeHeaderValue(req.headers['x-zt-key-id']),
  'x-zt-timestamp': normalizeHeaderValue(req.headers['x-zt-timestamp']),
  'x-zt-nonce': normalizeHeaderValue(req.headers['x-zt-nonce']),
  'x-zt-body-sha256': normalizeHeaderValue(req.headers['x-zt-body-sha256']),
  'x-zt-signature': normalizeHeaderValue(req.headers['x-zt-signature']),
});

export const verifyProxySignatureIfNeeded = async (
  req: IncomingMessage,
  body: string,
  signing: ProxySigningConfig
): Promise<{ ok: boolean; error?: { status: number; message: string } }> => {
  const headers = extractSigningHeaders(req);

  if (!SigningService.shouldVerify(signing, headers)) {
    return { ok: true };
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const verified = await SigningService.verify({
    method: req.method ?? 'POST',
    url,
    body,
    headers,
    signing,
  });

  if (!verified.ok) {
    return { ok: false, error: { status: verified.status, message: verified.message } };
  }

  return { ok: true };
};
