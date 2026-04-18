import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { isNonEmptyString } from '@helper/index';
import type { IncomingMessage } from '@node-singletons/http';
import type { ProxySigningConfig } from '@proxy/ProxyConfig';
import { resolveProxySigningConfig } from '@proxy/ProxySigningConfigResolver';
import { extractSigningHeaders, verifyProxySignatureIfNeeded } from '@proxy/ProxySigningRequest';

export type BaseProxyConfig = {
  host: string;
  port: number;
  maxBodyBytes: number;
};

export type BaseProxyOverrides = Partial<{
  host: string;
  port: number;
  maxBodyBytes: number;
  requireSigning: boolean;
  keyId: string;
  secret: string;
  signingWindowMs: number;
}>;

const PROXY_DEBUG_ENV_BY_SERVICE = Object.freeze({
  MySQLProxyServer: 'MYSQL_PROXY_DEBUG',
  PostgresProxyServer: 'POSTGRES_PROXY_DEBUG',
  RedisProxyServer: 'REDIS_PROXY_DEBUG',
  SqlServerProxyServer: 'SQLSERVER_PROXY_DEBUG',
} satisfies Record<string, string>);

const parseProxyDebugValue = (raw: string): boolean | undefined => {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return undefined;
};

const resolveProxyDebugEnabled = (serviceName: string): boolean => {
  const serviceEnvKey =
    PROXY_DEBUG_ENV_BY_SERVICE[serviceName as keyof typeof PROXY_DEBUG_ENV_BY_SERVICE];
  const serviceRaw = serviceEnvKey ? Env.get(serviceEnvKey, '') : '';
  if (isNonEmptyString(serviceRaw)) {
    const parsed = parseProxyDebugValue(serviceRaw);
    if (parsed !== undefined) return parsed;
  }

  const sharedRaw = Env.get('ZT_PROXY_DEBUG', '');
  if (isNonEmptyString(sharedRaw)) {
    const parsed = parseProxyDebugValue(sharedRaw);
    if (parsed !== undefined) return parsed;
  }

  return false;
};

export const resolveBaseConfig = (
  overrides: BaseProxyOverrides,
  prefix: string,
  defaults?: { host?: string; port?: number; maxBodyBytes?: number }
): BaseProxyConfig => {
  const host =
    overrides.host ?? Env.get(`${prefix}_PROXY_HOST`, Env.HOST ?? defaults?.host ?? '127.0.0.1');
  const port =
    overrides.port ?? Env.getInt(`${prefix}_PROXY_PORT`, Env.PORT ?? defaults?.port ?? 3000);
  const maxBodyBytes =
    overrides.maxBodyBytes ??
    Env.getInt(`${prefix}_PROXY_MAX_BODY_BYTES`, Env.MAX_BODY_SIZE ?? defaults?.maxBodyBytes ?? 0);

  return { host, port, maxBodyBytes };
};

export const resolveBaseSigningConfig = (
  overrides: BaseProxyOverrides,
  prefix: string
): {
  keyId: string;
  secret: string;
  requireSigning: boolean;
  signingWindowMs: number;
} =>
  resolveProxySigningConfig(overrides, {
    keyIdEnvVar: `${prefix}_PROXY_KEY_ID`,
    secretEnvVar: `${prefix}_PROXY_SECRET`,
    requireEnvVar: `${prefix}_PROXY_REQUIRE_SIGNING`,
    windowEnvVar: `${prefix}_PROXY_SIGNING_WINDOW_MS`,
  });

export const verifyRequestSignature = async (
  req: IncomingMessage,
  body: string,
  config: { signing: ProxySigningConfig },
  serviceName: string
): Promise<{ ok: boolean; error?: { status: number; message: string } }> => {
  const headers = extractSigningHeaders(req);

  const hasAnySigningHeader = Object.values(headers).some(
    (value) => typeof value === 'string' && value.trim() !== ''
  );

  if (resolveProxyDebugEnabled(serviceName)) {
    Logger.debug(`[${serviceName}] Verifying request signature`, {
      ...Logger.withTraceSkipContext({
        path: req.url ?? '',
        method: req.method ?? 'POST',
        requireSigning: config.signing.require,
        hasAnySigningHeader,
        configuredKeyId: config.signing.keyId,
        hasConfiguredSecret: config.signing.secret.trim() !== '',
        bodyBytes: body.length,
      }),
    });
  }

  const verified = await verifyProxySignatureIfNeeded(req, body, config.signing);
  if (!verified.ok) {
    const error = verified.error ?? { status: 401, message: 'Unauthorized' };
    Logger.warn(`[${serviceName}] Signature verification failed`, {
      ...Logger.withTraceSkipContext({
        path: req.url ?? '',
        method: req.method ?? 'POST',
        status: error.status,
        message: error.message,
      }),
    });
    return { ok: false, error };
  }

  return { ok: true };
};
