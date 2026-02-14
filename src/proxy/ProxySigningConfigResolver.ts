import { Env } from '@config/env';
import { normalizeSigningCredentials } from '@proxy/SigningService';

type SigningOverrideLike = Partial<{
  requireSigning: boolean;
  keyId: string;
  secret: string;
  signingWindowMs: number;
}>;

type ResolveSigningConfigOptions = {
  keyIdEnvVar: string;
  secretEnvVar: string;
  requireEnvVar: string;
  windowEnvVar: string;
  defaultRequire?: boolean;
  defaultWindowMs?: number;
};

export const resolveProxySigningConfig = (
  overrides: SigningOverrideLike | undefined,
  options: ResolveSigningConfigOptions
): {
  keyId: string;
  secret: string;
  requireSigning: boolean;
  signingWindowMs: number;
} => {
  const normalizedOverrides = overrides ?? {};
  const appName = Env.get('APP_NAME', Env.APP_NAME ?? 'ZinTrust');
  const appKey = Env.get('APP_KEY', Env.APP_KEY ?? '');

  const envKeyId = Env.get(options.keyIdEnvVar, appName);
  const envSecret = Env.get(options.secretEnvVar, appKey);

  const keyIdRaw = normalizedOverrides.keyId ?? (envKeyId.trim() === '' ? appName : envKeyId);
  const secretRaw = normalizedOverrides.secret ?? (envSecret.trim() === '' ? appKey : envSecret);
  const secret = secretRaw.trim() === '' ? appKey : secretRaw;

  const creds = normalizeSigningCredentials({ keyId: keyIdRaw, secret });

  const requireSigning =
    normalizedOverrides.requireSigning ??
    Env.getBool(options.requireEnvVar, options.defaultRequire ?? true);
  const signingWindowMs =
    normalizedOverrides.signingWindowMs ??
    Env.getInt(options.windowEnvVar, options.defaultWindowMs ?? 60000);

  return {
    keyId: creds.keyId,
    secret: creds.secret,
    requireSigning,
    signingWindowMs,
  };
};

export default resolveProxySigningConfig;
