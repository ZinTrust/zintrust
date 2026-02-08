/**
 * Redis Test Routes
 * Tests Redis connectivity via Durable Object pool and proxy from Cloudflare Workers
 */

import { Cloudflare } from '@config/cloudflare';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import welcome from '@mail/templates/welcome';
import { Mail } from '@tools/mail';
import { WorkerFactory } from '@zintrust/workers';
import type { CacheDriver } from 'packages/cache-redis/src';
import { RedisProxyAdapter, RedisWorkersDurableObjectAdapter } from 'packages/cache-redis/src';

const ADVANCED_WORKER_SPEC = 'https://wk.zintrust.com/AdvancEmailWorker.js';

type TestS = Promise<{
  key: string;
  wrote: {
    ok: boolean;
    ts: string;
  };
  read: {
    ok: boolean;
    ts: string;
  } | null;
  exists: boolean;
  existsAfterDelete: boolean;
}>;

const runRedisTest = async (driver: CacheDriver, label: string): TestS => {
  const key = `zt:redis-test:${label}:${Date.now()}`;
  const value = { ok: true, ts: new Date().toISOString() };

  await driver.set(key, value, 30);
  const read = await driver.get<typeof value>(key);
  const exists = await driver.has(key);
  await driver.delete(key);
  const existsAfterDelete = await driver.has(key);

  return {
    key,
    wrote: value,
    read,
    exists,
    existsAfterDelete,
  };
};

/**
 * Test Redis via Durable Object pool binding (REDIS_POOL)
 */
export const testRedisDurableObject = async (_req: IRequest, res: IResponse): Promise<void> => {
  try {
    if (Cloudflare.getWorkersEnv() === null) {
      throw ErrorFactory.createConfigError(
        'Durable Object test requires Cloudflare Workers runtime.'
      );
    }

    const driver = RedisWorkersDurableObjectAdapter.create();
    const result = await runRedisTest(driver, 'do');

    res.json({
      success: true,
      message: 'Redis Durable Object test successful',
      adapter: 'packages/cache-redis (Durable Object pool)',
      runtime: 'Cloudflare Workers',
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Redis Durable Object test failed',
      details: String(error),
      adapter: 'packages/cache-redis (Durable Object pool)',
      runtime: 'Cloudflare Workers',
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Test Redis via HTTP proxy
 */
export const testRedisProxy = async (_req: IRequest, res: IResponse): Promise<void> => {
  const isFlare = Cloudflare?.getWorkersEnv() !== null;

  try {
    const driver = RedisProxyAdapter.create();
    const result = await runRedisTest(driver, 'proxy');
    res.json({
      success: true,
      message: 'Redis proxy test successful',
      adapter: 'packages/cache-redis (proxy)',
      runtime: isFlare ? 'Cloudflare Workers' : 'Node',
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Redis proxy test failed',
      details: String(error),
      adapter: 'packages/cache-redis (proxy)',
      runtime: isFlare ? 'Cloudflare Workers' : 'Node',
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Test URL-based worker processor resolution (Cloudflare Workers)
 */
export const testWorkerProcessorUrl = async (_req: IRequest, res: IResponse): Promise<void> => {
  const isFlare = Cloudflare?.getWorkersEnv() !== null;

  try {
    const resolved = await WorkerFactory.resolveProcessorSpec(ADVANCED_WORKER_SPEC);
    if (!resolved) {
      throw ErrorFactory.createConfigError('PROCESSOR_SPEC_NOT_RESOLVED');
    }

    res.json({
      success: true,
      message: 'Processor spec resolved successfully',
      spec: ADVANCED_WORKER_SPEC,
      runtime: isFlare ? 'Cloudflare Workers' : 'Node',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Processor spec resolution failed',
      spec: ADVANCED_WORKER_SPEC,
      details: String(error),
      runtime: isFlare ? 'Cloudflare Workers' : 'Node',
      timestamp: new Date().toISOString(),
    });
  }
};

const getMailConfig = (): {
  mailHost: string;
  mailUsername: string;
  mailPassword: string;
  mailDriver: string;
  isConfigured: boolean;
  configStatus: {
    driver: string;
    host: string;
    username: string;
    password: string;
  };
} => {
  const mailHost = process.env['MAIL_HOST'] ?? '';
  const mailUsername = process.env['MAIL_USERNAME'] ?? '';
  const mailPassword = process.env['MAIL_PASSWORD'] ?? '';
  const mailDriver = process.env['MAIL_DRIVER'] ?? process.env['MAIL_CONNECTION'] ?? 'smtp';

  return {
    mailHost,
    mailUsername,
    mailPassword,
    mailDriver,
    isConfigured: Boolean(mailHost) && Boolean(mailUsername) && Boolean(mailPassword),
    configStatus: {
      driver: mailDriver,
      host: mailHost ? 'configured' : 'missing',
      username: mailUsername ? 'configured' : 'missing',
      password: mailPassword ? 'configured' : 'missing',
    },
  };
};

const getMailErrorDetails = (errorMessage: string): { errorType: string; suggestion: string } => {
  const isConnectionError =
    errorMessage.includes('ConnectionError') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('ETIMEDOUT');
  const isAuthError =
    errorMessage.includes('auth') || errorMessage.includes('535') || errorMessage.includes('530');
  const isConfigError = errorMessage.includes('Configuration') || errorMessage.includes('config');

  if (isConnectionError) {
    return {
      errorType: 'connection',
      suggestion: 'Check MAIL_HOST, MAIL_PORT, and network connectivity',
    };
  }

  if (isAuthError) {
    return {
      errorType: 'authentication',
      suggestion: 'Verify MAIL_USERNAME and MAIL_PASSWORD are correct',
    };
  }

  if (isConfigError) {
    return {
      errorType: 'configuration',
      suggestion: 'Check mail driver configuration',
    };
  }

  return {
    errorType: 'unknown',
    suggestion: 'Check mail service logs for more details',
  };
};

/**
 * Test sending email using configured mail driver
 */
export const testMailSend = async (req: IRequest, res: IResponse): Promise<void> => {
  const isFlare = Cloudflare?.getWorkersEnv() !== null;
  const mailConfig = getMailConfig();

  try {
    if (mailConfig.mailDriver === 'smtp' && !mailConfig.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Mail configuration incomplete',
        message:
          'SMTP mail driver requires MAIL_HOST, MAIL_USERNAME, and MAIL_PASSWORD environment variables',
        config: mailConfig.configStatus,
        runtime: isFlare ? 'Cloudflare Workers' : 'Node',
        timestamp: new Date().toISOString(),
      });
    }

    const to = req.getQueryParam?.('to') ?? 'test@zintrust.com';
    const subject = 'SMTP test from ZinTrust';

    const htmlContent = await Mail.render({
      template: welcome,
      variables: { alertType: 'critical' },
    });

    const result = await Mail.send({
      to: to ?? 'test@zintrust.com',
      subject: subject ?? 'Worker Notification from ZinTrust',
      text: `Worker job completed successfully.`,
      html: htmlContent,
      from: {
        address: 'no-reply@engage.vizo.app',
        name: 'ZinTrust Advanced Worker',
      },
    });

    res.json({
      success: true,
      message: 'Mail send test completed successfully',
      to,
      result,
      config: mailConfig.configStatus,
      runtime: isFlare ? 'Cloudflare Workers' : 'Node',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = String(error);
    const { errorType, suggestion } = getMailErrorDetails(errorMessage);

    res.status(500).json({
      success: false,
      error: 'Mail send test failed',
      errorType,
      details: errorMessage,
      suggestion,
      config: mailConfig.configStatus,
      runtime: isFlare ? 'Cloudflare Workers' : 'Node',
      timestamp: new Date().toISOString(),
    });
  }
};
