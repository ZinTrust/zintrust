/**
 * Rate Limiter Middleware
 * Token bucket implementation for request rate limiting
 * Zero-dependency implementation
 */

import { Logger } from '@config/logger';
import { IRequest } from '@http/Request';
import { IResponse } from '@http/Response';
import { Middleware } from '@middleware/MiddlewareStack';

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
  message?: string;
  statusCode?: number;
  headers?: boolean;
  keyGenerator?: (req: IRequest) => string;
}

interface ClientState {
  count: number;
  resetTime: number;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please try again later.',
  statusCode: 429,
  headers: true,
  keyGenerator: (req: IRequest) => {
    return (
      (req.getHeader('x-forwarded-for') as string) ?? req.getRaw().socket.remoteAddress ?? 'unknown'
    );
  },
};

export const RateLimiter = Object.freeze({
  /**
   * Create rate limiter middleware
   */
  create(options: RateLimitOptions = DEFAULT_OPTIONS): Middleware {
    const config = { ...DEFAULT_OPTIONS, ...options };
    const clients = new Map<string, ClientState>();

    // Cleanup to prevent unbounded growth.
    // Done lazily (on requests) to avoid background timers in serverless/test environments.
    let nextCleanupAt = Date.now() + config.windowMs;
    const cleanupExpiredClients = (now: number): void => {
      if (now < nextCleanupAt) return;
      for (const [key, state] of clients.entries()) {
        if (now > state.resetTime) {
          clients.delete(key);
        }
      }
      nextCleanupAt = now + config.windowMs;
    };

    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      const key = config.keyGenerator ? config.keyGenerator(req) : 'unknown';
      const now = Date.now();

      cleanupExpiredClients(now);

      let client = clients.get(key);

      // Initialize or reset if window expired
      if (!client || now > client.resetTime) {
        client = {
          count: 0,
          resetTime: now + config.windowMs,
        };
        clients.set(key, client);
      }

      client.count++;

      const remaining = Math.max(0, config.max - client.count);
      const resetTime = Math.ceil((client.resetTime - now) / 1000);

      // Set headers
      if (config.headers ?? false) {
        res.setHeader('X-RateLimit-Limit', config.max.toString());
        res.setHeader('X-RateLimit-Remaining', remaining.toString());
        res.setHeader('X-RateLimit-Reset', resetTime.toString());
      }

      // Check limit
      if (client.count > config.max) {
        Logger.warn(`Rate limit exceeded for IP: ${key}`);
        res.setStatus(config.statusCode ?? 429);
        res.json({
          error: 'Too Many Requests',
          message: config.message,
        });
        return;
      }

      await next();
    };
  },
});
