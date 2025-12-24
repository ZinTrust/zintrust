/**
 * Security Middleware
 * Implements standard security headers and CORS protection
 * Zero-dependency implementation replacing helmet/cors
 */

import { IRequest } from '@http/Request';
import { IResponse } from '@http/Response';
import { Middleware } from '@middleware/MiddlewareStack';

export interface SecurityOptions {
  hsts?: {
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  frameguard?: {
    action?: 'DENY' | 'SAMEORIGIN';
  };
  cors?: {
    origin?: string;
    methods?: string[];
    allowedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
  };
  csp?: {
    directives?: Record<string, string[]>;
  };
}

const DEFAULT_OPTIONS: SecurityOptions = {
  hsts: {
    maxAge: 15552000, // 180 days
    includeSubDomains: true,
    preload: false,
  },
  frameguard: {
    action: 'SAMEORIGIN',
  },
  cors: {
    origin: '*',
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
    credentials: true,
    maxAge: 86400,
  },
};

function applyHsts(res: IResponse, hsts?: SecurityOptions['hsts']): void {
  if (!hsts) return;

  let headerValue = `max-age=${hsts.maxAge}`;
  if (hsts.includeSubDomains ?? false) headerValue += '; includeSubDomains';
  if (hsts.preload ?? false) headerValue += '; preload';
  res.setHeader('Strict-Transport-Security', headerValue);
}

function applyFrameguard(res: IResponse, frameguard?: SecurityOptions['frameguard']): void {
  if (!frameguard) return;
  res.setHeader('X-Frame-Options', frameguard.action ?? 'SAMEORIGIN');
}

function applyNoSniff(res: IResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function applyReferrerPolicy(res: IResponse): void {
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function applyCsp(res: IResponse, csp?: SecurityOptions['csp']): void {
  if (!csp?.directives) return;

  const headerValue = Object.entries(csp.directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
  res.setHeader('Content-Security-Policy', headerValue);
}

function applyCors(req: IRequest, res: IResponse, cors?: SecurityOptions['cors']): boolean {
  if (!cors) return false;

  const originHeader = req.getHeader('origin');
  const origin = typeof originHeader === 'string' ? originHeader : undefined;

  let allowedOrigin = cors.origin;
  if (Array.isArray(cors.origin)) {
    if (origin === undefined || !cors.origin.includes(origin)) {
      allowedOrigin = undefined;
    } else {
      allowedOrigin = origin;
    }
  }

  if (allowedOrigin !== null && allowedOrigin !== undefined) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin ?? '*');
  }

  if (cors.methods) {
    res.setHeader('Access-Control-Allow-Methods', cors.methods.join(', '));
  }

  if (cors.allowedHeaders) {
    res.setHeader('Access-Control-Allow-Headers', cors.allowedHeaders.join(', '));
  }

  if (cors.credentials !== undefined) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (cors.maxAge !== undefined) {
    res.setHeader('Access-Control-Max-Age', cors.maxAge.toString());
  }

  // Handle Preflight
  if (req.getMethod() === 'OPTIONS') {
    res.setStatus(204);
    return true;
  }

  return false;
}

export const SecurityMiddleware = Object.freeze({
  /**
   * Create security middleware with options
   */
  create(options: SecurityOptions = {}): Middleware {
    const config = { ...DEFAULT_OPTIONS, ...options };

    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      applyHsts(res, config.hsts);
      applyFrameguard(res, config.frameguard);
      applyNoSniff(res);
      applyReferrerPolicy(res);
      applyCsp(res, config.csp);

      const preflightHandled = applyCors(req, res, config.cors);
      if (preflightHandled) return;

      await next();
    };
  },
});
