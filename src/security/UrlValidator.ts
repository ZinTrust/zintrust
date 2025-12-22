/**
 * Security Utilities
 * Mitigates SSRF (SonarQube S5144)
 */

import { ValidationError } from '@/exceptions/ZintrustError';
import { Env } from '@config/env';
import { Logger } from '@config/logger';

/**
 * Validate URL for SSRF protection
 * Ensures URL is either internal or matches allowed domains
 */
export function validateUrl(
  url: string,
  allowedDomains: string[] = ['localhost', '127.0.0.1']
): void {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;

    // In a real microservices environment, we would check against a service registry
    // For now, we allow localhost and any domain in the allowed list
    const isAllowed = allowedDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed && Env.NODE_ENV === 'production') {
      throw new ValidationError(`URL hostname '${hostname}' is not allowed (SSRF Protection)`);
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    Logger.error('URL validation failed', error);
    throw new ValidationError(`Invalid URL: ${url}`);
  }
}
