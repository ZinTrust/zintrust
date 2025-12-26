/**
 * Security Utilities
 * Mitigates SSRF (SonarQube S5144)
 */

import { appConfig } from '@/config';
import { ErrorFactory, type IZintrustError } from '@exceptions/ZintrustError';

export interface IUrlValidator {
  validate(url: string, allowedDomains?: string[]): void;
  validateUrl(url: string, allowedDomains?: string[]): void;
}

/**
 * Validate URL for SSRF protection
 * Ensures URL is either internal or matches allowed domains
 */
const validate = (url: string, allowedDomains: string[] = ['localhost', '127.0.0.1']): void => {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;

    // In a real microservices environment, we would check against a service registry
    // For now, we allow localhost and any domain in the allowed list
    const isAllowed = allowedDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed && appConfig.isProduction()) {
      throw ErrorFactory.createValidationError(
        `URL hostname '${hostname}' is not allowed (SSRF Protection)`,
        { hostname }
      );
    }
  } catch (error) {
    const maybeZinError = error as Partial<IZintrustError>;
    if (maybeZinError.code === 'VALIDATION_ERROR') {
      throw error;
    }

    throw ErrorFactory.createValidationError(`Invalid URL: ${url}`, { cause: error });
  }
};

const validateUrl = (url: string, allowedDomains?: string[]): void => {
  return validate(url, allowedDomains);
};

/**
 * UrlValidator handles URL validation for SSRF protection
 * Sealed namespace for immutability
 */
export const UrlValidator: IUrlValidator = Object.freeze({
  validate,
  validateUrl,
});

// Re-export for backward compatibility
export { validate, validateUrl };
