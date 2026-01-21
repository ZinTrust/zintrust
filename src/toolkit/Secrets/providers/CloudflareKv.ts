import { readEnvString } from '@common/ExternalServiceUtils';
import { ErrorFactory } from '@exceptions/ZintrustError';

export const CloudflareKv = Object.freeze({
  createFromEnv(): {
    getValue: (key: string, namespaceId?: string) => Promise<string | null>;
    putValue: (key: string, value: string, namespaceId?: string) => Promise<void>;
  } {
    const accountId = readEnvString('CLOUDFLARE_ACCOUNT_ID');
    const apiToken = readEnvString('CLOUDFLARE_API_TOKEN');
    const defaultNamespaceId = readEnvString('CLOUDFLARE_KV_NAMESPACE_ID');

    if (accountId.trim() === '' || apiToken.trim() === '') {
      throw ErrorFactory.createCliError(
        'Cloudflare credentials missing: set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN'
      );
    }

    const getNs = (namespaceId?: string): string => {
      const resolved = namespaceId ?? defaultNamespaceId;
      if (resolved.trim() === '') {
        throw ErrorFactory.createCliError(
          'Cloudflare KV namespace missing: set CLOUDFLARE_KV_NAMESPACE_ID or set namespaceId in manifest'
        );
      }
      return resolved;
    };

    const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`;

    const getValue = async (key: string, namespaceId?: string): Promise<string | null> => {
      const ns = getNs(namespaceId);
      const url = `${base}/${encodeURIComponent(ns)}/values/${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      });

      if (res.status === 404) return null;

      const text = await res.text();
      if (!res.ok) {
        throw ErrorFactory.createCliError(`Cloudflare KV GET failed (${res.status})`, {
          status: res.status,
          body: text,
        });
      }

      return text;
    };

    const putValue = async (key: string, value: string, namespaceId?: string): Promise<void> => {
      const ns = getNs(namespaceId);
      const url = `${base}/${encodeURIComponent(ns)}/values/${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'content-type': 'text/plain',
        },
        body: value,
      });

      const text = await res.text();
      if (!res.ok) {
        throw ErrorFactory.createCliError(`Cloudflare KV PUT failed (${res.status})`, {
          status: res.status,
          body: text,
        });
      }
    };

    return { getValue, putValue };
  },

  doctorEnv(): string[] {
    const missing: string[] = [];

    const accountId = readEnvString('CLOUDFLARE_ACCOUNT_ID').trim();
    if (accountId === '') missing.push('CLOUDFLARE_ACCOUNT_ID');

    const apiToken = readEnvString('CLOUDFLARE_API_TOKEN').trim();
    if (apiToken === '') missing.push('CLOUDFLARE_API_TOKEN');

    const namespaceId = readEnvString('CLOUDFLARE_KV_NAMESPACE_ID').trim();
    if (namespaceId === '') missing.push('CLOUDFLARE_KV_NAMESPACE_ID');

    return missing;
  },
});

export default CloudflareKv;
