import { ErrorFactory } from '@exceptions/ZintrustError';
import { normalizeSigningCredentials } from '@proxy/SigningService';
import { SignedRequest } from '@security/SignedRequest';

import { buildSigningUrl } from '@orm/adapters/ProxySigningPath';

export const createSignedProxyRequest = async (input: {
  url: string;
  body: string;
  keyId: string;
  secret: string;
  missingCredentialsMessage: string;
}): Promise<{ headers: Record<string, string>; body: string }> => {
  const creds = normalizeSigningCredentials({ keyId: input.keyId, secret: input.secret });

  if (creds.keyId.trim() === '' || creds.secret.trim() === '') {
    throw ErrorFactory.createConfigError(input.missingCredentialsMessage);
  }

  const urlObj = new URL(input.url);
  const signingUrl = buildSigningUrl(urlObj, input.url);
  const signResult = await SignedRequest.createHeaders({
    method: 'POST',
    url: signingUrl,
    body: input.body,
    keyId: creds.keyId,
    secret: creds.secret,
  });

  return {
    headers: {
      'content-type': 'application/json',
      'x-zt-key-id': signResult['x-zt-key-id'],
      'x-zt-timestamp': signResult['x-zt-timestamp'],
      'x-zt-nonce': signResult['x-zt-nonce'],
      'x-zt-body-sha256': signResult['x-zt-body-sha256'],
      'x-zt-signature': signResult['x-zt-signature'],
    },
    body: input.body,
  };
};
