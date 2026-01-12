/**
 * JWT Dev Command
 * Mint a local development JWT for quick manual API testing.
 */

import { BaseCommand, type CommandOptions, type IBaseCommand } from '@cli/BaseCommand';
import { appConfig } from '@config/app';
import { securityConfig } from '@config/security';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { JwtManager, type IJwtManager, type JwtPayload } from '@security/JwtManager';
import type { Command } from 'commander';

type JwtDevCommandOptions = CommandOptions & {
  sub?: string;
  email?: string;
  role?: string;
  expires?: string;
  json?: boolean;
  allowProduction?: boolean;
};

const parseExpiresToSeconds = (value: unknown): number => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw === '') return 60 * 60;

  // Allow raw seconds
  if (/^\d+$/.test(raw)) {
    const seconds = Number.parseInt(raw, 10);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw ErrorFactory.createCliError(`Invalid --expires '${raw}'. Must be > 0 seconds.`);
    }
    return seconds;
  }

  const match = /^(\d+)([smhd])$/i.exec(raw);
  if (!match) {
    throw ErrorFactory.createCliError(
      `Invalid --expires '${raw}'. Use seconds (e.g. 3600) or a duration like 30m, 1h, 7d.`
    );
  }

  const amount = Number.parseInt(match[1] ?? '', 10);
  const unit = (match[2] ?? '').toLowerCase();

  if (!Number.isFinite(amount) || amount <= 0) {
    throw ErrorFactory.createCliError(`Invalid --expires '${raw}'. Must be > 0.`);
  }

  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };

  const multiplier = multipliers[unit];
  if (multiplier === undefined) {
    throw ErrorFactory.createCliError(
      `Invalid --expires '${raw}'. Supported units: s, m, h, d (e.g. 30m, 1h).`
    );
  }

  return amount * multiplier;
};

const assertNotProduction = (allowProduction: unknown): void => {
  if (!appConfig.isProduction()) return;
  if (allowProduction === true) return;

  throw ErrorFactory.createCliError(
    "Refusing to mint a dev JWT in production. Use --allow-production only if you know what you're doing."
  );
};

const createJwt = (payload: JwtPayload, expiresInSeconds: number): string => {
  const algorithm = securityConfig.jwt.algorithm;
  const secret = securityConfig.jwt.secret;

  const jwt: IJwtManager = JwtManager.create();

  if (algorithm === 'HS256' || algorithm === 'HS512') {
    jwt.setHmacSecret(secret);
  } else {
    throw ErrorFactory.createCliError(
      `JWT algorithm '${algorithm}' is not supported by zin jwt:dev (HS256/HS512 only).`
    );
  }

  return jwt.sign(payload, {
    algorithm,
    expiresIn: expiresInSeconds,
    issuer: securityConfig.jwt.issuer,
    audience: securityConfig.jwt.audience,
    subject: typeof payload.sub === 'string' ? payload.sub : undefined,
    jwtId: jwt.generateJwtId(),
  });
};

export const JwtDevCommand: IBaseCommand = Object.freeze(
  BaseCommand.create({
    name: 'jwt:dev',
    description: 'Mint a local development JWT (for manual API testing)',
    aliases: ['jwt:token', 'jwt:mint'],
    addOptions: (command: Command) => {
      command
        .option('--sub <sub>', 'JWT subject claim (default: 1)', '1')
        .option('--email <email>', 'Email claim')
        .option('--role <role>', 'Role claim')
        .option('--expires <duration>', "Expiry: seconds or 30m/1h/7d (default: '1h')", '1h')
        .option('--json', 'Output machine-readable JSON')
        .option('--allow-production', 'Allow running in production (dangerous)');
    },
    execute: (options: JwtDevCommandOptions): void => {
      assertNotProduction(options.allowProduction);

      const expiresInSeconds = parseExpiresToSeconds(options.expires);

      const payload: JwtPayload = {
        ...(typeof options.sub === 'string' && options.sub.trim() !== ''
          ? { sub: options.sub.trim() }
          : {}),
        ...(typeof options.email === 'string' && options.email.trim() !== ''
          ? { email: options.email.trim() }
          : {}),
        ...(typeof options.role === 'string' && options.role.trim() !== ''
          ? { role: options.role.trim() }
          : {}),
      };

      const token = createJwt(payload, expiresInSeconds);

      /* eslint-disable no-console */
      if (options.json === true) {
        const nowSeconds = Math.floor(Date.now() / 1000);
        console.log(
          JSON.stringify({
            token,
            algorithm: securityConfig.jwt.algorithm,
            expiresIn: expiresInSeconds,
            issuedAt: nowSeconds,
            expiresAt: nowSeconds + expiresInSeconds,
            payload,
          })
        );
        return;
      }

      console.log(token);
      /* eslint-enable no-console */
    },
  })
);

export default JwtDevCommand;
