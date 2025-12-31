/**
 * XSS Protection Utilities
 * HTML escaping and sanitization (pure TypeScript, zero dependencies)
 * Sealed namespace pattern - all exports through XssProtection namespace
 */

import { Logger } from '@config/logger';

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',

  // Additional characters commonly escaped in attribute / template contexts
  '`': '&#96;',
  '=': '&#x3D;',
};

/**
 * Escape HTML special characters
 */
const escapeHtml = (text: string): string => {
  if (typeof text !== 'string') {
    return '';
  }
  return text.replaceAll(/[&<>"'/`=]/g, (char) => HTML_ESCAPE_MAP[char] || char);
};

/**
 * Sanitize HTML by removing dangerous tags and attributes
 */
const sanitizeHtml = (html: string): string => {
  if (typeof html !== 'string') {
    return '';
  }

  // Remove script tags and content (loop until stable to avoid incomplete multi-character sanitization)
  let sanitized = html;
  let prevScriptSanitized: string;
  do {
    prevScriptSanitized = sanitized;
    sanitized = sanitized.replaceAll(/<script\b[\s\S]*?<\/script[^<]*?>/gi, '');
  } while (sanitized !== prevScriptSanitized);

  // Remove iframe, object, embed, and base tags
  sanitized = sanitized.replaceAll(/<(?:iframe|object|embed|base)\b[\s\S]*?>/gi, '');
  sanitized = sanitized.replaceAll(/<\/(?:iframe|object|embed|base)>/gi, '');

  // Remove event handlers (on*). Re-apply until stable to avoid incomplete multi-character sanitization.
  let previousSanitized: string;
  do {
    previousSanitized = sanitized;
    sanitized = sanitized.replaceAll(/\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|`[^`]*`|[^\s>]*)/gi, '');
  } while (sanitized !== previousSanitized);

  // Remove dangerous protocols in URL-bearing attributes.
  // This uses the same protocol normalization logic as encodeHref to prevent obfuscations like:
  //   href="jav&#x61;script:..." or href="java\nscript:..." or href="%6a%61..."
  sanitized = sanitized.replaceAll(
    /(\s)(href|src|action|formaction|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (
      match: string,
      _leadingWhitespace: string,
      _attributeName: string,
      doubleQuotedValue: string | undefined,
      singleQuotedValue: string | undefined,
      unquotedValue: string | undefined
    ): string => {
      const rawValue = doubleQuotedValue ?? singleQuotedValue ?? unquotedValue ?? '';
      const protocolCheck = normalizeHrefForProtocolCheck(rawValue);

      // Allow relative URLs and fragments.
      if (
        protocolCheck.startsWith('/') ||
        protocolCheck.startsWith('#') ||
        protocolCheck.startsWith('./') ||
        protocolCheck.startsWith('../') ||
        protocolCheck.startsWith('//')
      ) {
        return match;
      }

      // Allow-list a narrow set of data:image/* URLs for common raster formats.
      if (protocolCheck.startsWith('data:')) {
        const allowedDataImagePrefixes = [
          'data:image/png',
          'data:image/jpeg',
          'data:image/jpg',
          'data:image/gif',
          'data:image/webp',
          'data:image/avif',
        ];

        if (allowedDataImagePrefixes.some((p) => protocolCheck.startsWith(p))) {
          return match;
        }
        return '';
      }

      const blockedProtocols = ['javascript:', 'vbscript:']; // NOSONAR: S1523 - Explicit protocol blocking to prevent XSS
      if (blockedProtocols.some((p) => protocolCheck.startsWith(p))) {
        return '';
      }

      // If a scheme is present, allowlist it.
      const schemeMatch = new RegExp(/^([a-z][a-z0-9+.-]*):/i).exec(protocolCheck);
      if (schemeMatch) {
        const scheme = schemeMatch[1].toLowerCase();
        const allowedSchemes = new Set(['http', 'https', 'mailto', 'tel']);
        if (!allowedSchemes.has(scheme)) {
          return '';
        }
      }

      // Otherwise, keep the attribute (e.g. relative-like values without a scheme).
      return match;
    }
  );

  // Remove style tags and style attributes with potentially dangerous content
  let prevSanitized: string;
  do {
    prevSanitized = sanitized;
    sanitized = sanitized.replaceAll(/<style\b[\s\S]*?<\/style>/gi, '');
  } while (sanitized !== prevSanitized);
  sanitized = sanitized.replaceAll(/\bstyle\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]*)/gi, '');

  // Remove form elements
  sanitized = sanitized.replaceAll(/<form\b[\s\S]*?<\/form>/gi, '');

  // Remove object and embed tags
  sanitized = sanitized.replaceAll(/<(?:object|embed|applet|meta|link|base)\b[\s\S]*?>/gi, '');

  return sanitized.trim();
};

/**
 * Encode URI component to prevent injection in URLs
 */
const encodeUri = (uri: string): string => {
  if (typeof uri !== 'string') {
    return '';
  }
  try {
    return encodeURIComponent(uri);
  } catch (error) {
    Logger.error('URI encoding failed', error);
    return '';
  }
};

/**
 * Encode URI for use in href attribute
 */
function decodeHtmlEntitiesForProtocolCheck(input: string): string {
  // Decode numeric HTML entities so obfuscations like "jav&#x61;script:" are caught.
  // This is intentionally minimal and only used for protocol detection (not output rendering).
  const decodeCodePoint = (codePoint: number): string => {
    if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
      return '';
    }
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return '';
    }
  };

  // Decode a small set of named entities commonly used for obfuscation.
  const namedDecoded = input.replaceAll(/&([a-z]+);?/gi, (m: string, name: string) => {
    const key = String(name).toLowerCase();
    if (key === 'colon') return ':';
    if (key === 'tab') return '\t';
    if (key === 'newline') return '\n';
    if (key === 'nbsp') return ' ';
    return m;
  });

  return namedDecoded
    .replaceAll(/&#(\d+);?/g, (_m: string, dec: string) => {
      const decStr = typeof dec === 'string' ? dec : String(dec);
      return decodeCodePoint(Number.parseInt(decStr, 10)) || _m;
    })
    .replaceAll(/&#x([0-9a-f]+);?/gi, (_m: string, hex: string) => {
      const hexStr = typeof hex === 'string' ? hex : String(hex);
      return decodeCodePoint(Number.parseInt(hexStr, 16)) || _m;
    });
}

function tryDecodePercentEncoding(input: string, rounds = 2): string {
  let out = input;
  for (let i = 0; i < rounds; i += 1) {
    try {
      const decoded = decodeURIComponent(out);
      if (decoded === out) {
        break;
      }
      out = decoded;
    } catch {
      break;
    }
  }
  return out;
}

function normalizeHrefForProtocolCheck(href: string): string {
  // Decode common obfuscations before protocol checks.
  const entityDecoded = decodeHtmlEntitiesForProtocolCheck(href);
  const percentDecoded = tryDecodePercentEncoding(entityDecoded, 2);

  // Remove control characters and whitespace to prevent "java\nscript:" bypasses.
  // eslint-disable-next-line no-control-regex
  return percentDecoded.replaceAll(/[\x00-\x20\x7f\u00a0]/g, '').toLowerCase();
}

const encodeHref = (href: string): string => {
  if (typeof href !== 'string') {
    return '';
  }

  const protocolCheck = normalizeHrefForProtocolCheck(href);

  // Allow relative URLs and fragments.
  if (
    protocolCheck.startsWith('/') ||
    protocolCheck.startsWith('#') ||
    protocolCheck.startsWith('./') ||
    protocolCheck.startsWith('../') ||
    protocolCheck.startsWith('//')
  ) {
    return escapeHtml(href);
  }

  // Explicitly block common dangerous protocols (including obfuscated versions).
  // Allow-list a narrow set of data:image/* URLs for common raster formats.
  if (protocolCheck.startsWith('data:')) {
    const allowedDataImagePrefixes = [
      'data:image/png',
      'data:image/jpeg',
      'data:image/jpg',
      'data:image/gif',
      'data:image/webp',
      'data:image/avif',
    ];

    if (allowedDataImagePrefixes.some((p) => protocolCheck.startsWith(p))) {
      return escapeHtml(href);
    }
    return '';
  }

  const blockedProtocols = ['javascript:', 'vbscript:']; // NOSONAR: S1523 - Explicit protocol blocking to prevent XSS
  if (blockedProtocols.some((p) => protocolCheck.startsWith(p))) {
    return '';
  }

  // If a scheme is present, allowlist it.
  const schemeMatch = new RegExp(/^([a-z][a-z0-9+.-]*):/i).exec(protocolCheck);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    const allowedSchemes = new Set(['http', 'https', 'mailto', 'tel']);
    if (!allowedSchemes.has(scheme)) {
      return '';
    }
  }

  return escapeHtml(href);
};

/**
 * Check if string is safe URL (http, https, or relative)
 */
const isSafeUrl = (url: string): boolean => {
  if (typeof url !== 'string') {
    return false;
  }

  const trimmed = url.trim().toLowerCase();

  // Allow relative URLs
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) {
    return true;
  }

  // Allow http and https
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return true;
  }

  // Allow common safe schemes
  if (trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) {
    return true;
  }

  // Block dangerous protocols
  if (/^\w+:/.test(trimmed)) {
    return false;
  }

  return true;
};

/**
 * Escape JSON for safe embedding in HTML
 */
export const escapeJson = (obj: unknown): string => {
  const json = JSON.stringify(obj);
  return escapeHtml(json);
};

export interface IXssProtection {
  escape(text: string): string;
  sanitize(html: string): string;
  encodeUri(uri: string): string;
  encodeHref(href: string): string;
  isSafeUrl(url: string): boolean;
  escapeJson(obj: unknown): string;
}

/**
 * XSS Protection Utilities
 * HTML escaping and sanitization (pure TypeScript, zero dependencies)
 * Sealed namespace with protection methods
 */
export const XssProtection: IXssProtection = Object.freeze({
  escape: escapeHtml,
  sanitize: sanitizeHtml,
  encodeUri,
  encodeHref,
  isSafeUrl,
  escapeJson,
});
