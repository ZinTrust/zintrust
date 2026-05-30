/**
 * Security Middleware
 * Implements standard security headers and CORS protection
 * Zero-dependency implementation replacing helmet/cors
 */

import { securityConfig } from '@config/security';
import { isNullish, isUndefinedOrNull } from '@helper/index';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import type { Middleware } from '@middleware/MiddlewareStack';

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
    origin?: string | string[];
    methods?: string[];
    allowedHeaders?: string[];
    exposedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
  };
  csp?: {
    directives?: Record<string, string[]>;
  };
}

const normalizeCorsList = (values: readonly string[] | undefined, fallback: string[]): string[] => {
  const normalized = (values ?? [])
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value !== '');

  return normalized.length > 0 ? normalized : fallback;
};

const parseHeaderList = (value: string | undefined): string[] => {
  return String(value ?? '')
    .split(',')
    .map((element) => element.trim())
    .filter((element) => element !== '');
};

const hasWildcard = (values: readonly string[] | string | undefined): boolean => {
  if (typeof values === 'string') return values.trim() === '*';
  return (values ?? []).some((value) => value.trim() === '*');
};

const mergeCorsHeaders = (
  configured: string[] | undefined,
  requested: string[] | undefined
): string[] => {
  const merged = new Map<string, string>();

  for (const header of [...(configured ?? []), ...(requested ?? [])]) {
    const normalized = header.toLowerCase();
    if (normalized === '') continue;
    if (!merged.has(normalized)) {
      merged.set(normalized, header);
    }
  }

  return Array.from(merged.values());
};

const getSecurityCorsConfig = ():
  | NonNullable<(typeof securityConfig)['cors']>
  | Record<string, never> => {
  const config = securityConfig as { cors?: (typeof securityConfig)['cors'] } | undefined;
  return config?.cors ?? {};
};

const resolveCorsOrigin = (): string | string[] => {
  const origins = normalizeCorsList(getSecurityCorsConfig().origins, ['*']);
  return origins.includes('*') ? '*' : origins;
};

const resolveAllowedOrigin = (
  configuredOrigin: string | string[] | undefined,
  requestOrigin: string | undefined,
  credentials: boolean | undefined
): string | undefined => {
  if (configuredOrigin === undefined) return undefined;

  if (typeof configuredOrigin === 'string') {
    if (configuredOrigin.trim() === '*') {
      return credentials === true && requestOrigin !== undefined ? requestOrigin : '*';
    }
    return configuredOrigin;
  }

  if (hasWildcard(configuredOrigin)) {
    return credentials === true && requestOrigin !== undefined ? requestOrigin : '*';
  }

  if (requestOrigin === undefined || !configuredOrigin.includes(requestOrigin)) {
    return undefined;
  }

  return requestOrigin;
};

const resolveAllowedMethods = (
  configuredMethods: string[] | undefined,
  requestMethod: string | undefined
): string[] => {
  if (!hasWildcard(configuredMethods)) return configuredMethods ?? [];
  if (requestMethod === undefined || requestMethod.trim() === '') return ['*'];
  return [requestMethod.trim()];
};

const resolveAllowedHeaders = (
  configuredHeaders: string[] | undefined,
  requestedHeaders: string[]
): string[] => {
  if (hasWildcard(configuredHeaders)) {
    return requestedHeaders.length > 0 ? requestedHeaders : ['*'];
  }

  return mergeCorsHeaders(configuredHeaders, requestedHeaders);
};

const resolveExposedHeaders = (configuredHeaders: string[] | undefined): string[] => {
  if (!hasWildcard(configuredHeaders)) return configuredHeaders ?? [];
  return ['*'];
};

const applyCorsHeaders = (
  res: IResponse,
  options: {
    origin?: string;
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
    credentials?: boolean;
    maxAge?: number;
  }
): void => {
  if (options.origin !== undefined) {
    res.setHeader('Access-Control-Allow-Origin', options.origin);
  }

  if (options.methods.length > 0) {
    res.setHeader('Access-Control-Allow-Methods', options.methods.join(', '));
  }

  if (options.allowedHeaders.length > 0) {
    res.setHeader('Access-Control-Allow-Headers', options.allowedHeaders.join(', '));
  }

  if (options.exposedHeaders.length > 0) {
    res.setHeader('Access-Control-Expose-Headers', options.exposedHeaders.join(', '));
  }

  if (options.credentials !== undefined) {
    res.setHeader('Access-Control-Allow-Credentials', options.credentials ? 'true' : 'false');
  }

  if (options.maxAge !== undefined) {
    res.setHeader('Access-Control-Max-Age', options.maxAge.toString());
  }
};

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
    origin: resolveCorsOrigin(),
    methods: normalizeCorsList(getSecurityCorsConfig().methods, [
      'GET',
      'HEAD',
      'PUT',
      'PATCH',
      'POST',
      'DELETE',
    ]),
    allowedHeaders: normalizeCorsList(getSecurityCorsConfig().allowedHeaders, [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-CSRF-Token',
    ]),
    exposedHeaders: normalizeCorsList(getSecurityCorsConfig().exposedHeaders, []),
    credentials: getSecurityCorsConfig().credentials,
    maxAge: getSecurityCorsConfig().maxAge,
  },
};

const mergeSecurityOptions = (options: SecurityOptions): SecurityOptions => {
  return {
    hsts: { ...DEFAULT_OPTIONS.hsts, ...options.hsts },
    frameguard: { ...DEFAULT_OPTIONS.frameguard, ...options.frameguard },
    cors: { ...DEFAULT_OPTIONS.cors, ...options.cors },
    csp: options.csp ?? DEFAULT_OPTIONS.csp,
  };
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

  const method = req.getMethod();
  const originHeader = req.getHeader('origin');
  const origin = typeof originHeader === 'string' ? originHeader : undefined;

  // Handle Preflight
  if (method === 'OPTIONS') {
    const requestedMethodHeader = req.getHeader('access-control-request-method');
    const requestedMethod =
      typeof requestedMethodHeader === 'string' ? requestedMethodHeader : undefined;
    const requestedHeadersHeader = req.getHeader('access-control-request-headers');
    const requestedHeaders =
      typeof requestedHeadersHeader === 'string' ? parseHeaderList(requestedHeadersHeader) : [];

    // Validate origin first
    const allowedOrigin = resolveAllowedOrigin(cors.origin, origin, cors.credentials);
    if (allowedOrigin === undefined) {
      // Origin not allowed - don't set CORS headers and let request fail
      return false;
    }

    // Validate requested method is allowed
    const allowedMethods = resolveAllowedMethods(cors.methods, requestedMethod);
    if (allowedMethods.length === 0 || (allowedMethods.length === 1 && allowedMethods[0] === '*')) {
      // No specific methods configured or wildcard - allow
    } else if (
      !isUndefinedOrNull(requestedMethod) &&
      !isNullish(requestedMethod) &&
      !allowedMethods.includes(requestedMethod)
    ) {
      // Requested method not in allowed list
      return false;
    }

    // Apply CORS headers for preflight
    applyCorsHeaders(res, {
      origin: allowedOrigin,
      methods: allowedMethods,
      allowedHeaders: resolveAllowedHeaders(cors.allowedHeaders, requestedHeaders),
      exposedHeaders: resolveExposedHeaders(cors.exposedHeaders),
      credentials: cors.credentials,
      maxAge: cors.maxAge,
    });

    res.setStatus(204);
    res.send('');
    return true;
  }

  // Handle actual requests
  const allowedOrigin = resolveAllowedOrigin(cors.origin, origin, cors.credentials);
  if (allowedOrigin !== undefined) {
    applyCorsHeaders(res, {
      origin: allowedOrigin,
      methods: resolveAllowedMethods(cors.methods, undefined),
      allowedHeaders: resolveAllowedHeaders(cors.allowedHeaders, []),
      exposedHeaders: resolveExposedHeaders(cors.exposedHeaders),
      credentials: cors.credentials,
      maxAge: cors.maxAge,
    });
  }

  return false;
}

export const SecurityMiddleware = Object.freeze({
  /**
   * Create security middleware with options
   */
  create(options: SecurityOptions = {}): Middleware {
    const config = mergeSecurityOptions(options);

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
