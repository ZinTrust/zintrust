/**
 * XSS Protection Utilities
 * HTML escaping and sanitization (pure TypeScript, zero dependencies)
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
export function escapeHtml(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }
  return text.replaceAll(/[&<>"'/`=]/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Sanitize HTML by removing dangerous tags and attributes
 */
export function sanitizeHtml(html: string): string {
  if (typeof html !== 'string') {
    return '';
  }

  // Remove script tags and content
  let sanitized = html.replaceAll(/<script\b[\s\S]*?<\/script>/gi, '');

  // Remove iframe, object, embed, and base tags
  sanitized = sanitized.replaceAll(/<(?:iframe|object|embed|base)\b[\s\S]*?>/gi, '');
  sanitized = sanitized.replaceAll(/<\/(?:iframe|object|embed|base)>/gi, '');

  // Remove event handlers (on*)
  sanitized = sanitized.replaceAll(/\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]*)/gi, '');

  // Remove javascript: and data: URIs in attributes
  sanitized = sanitized.replaceAll(
    /\b(?:href|src|action|formaction|xlink:href)\s*=\s*['"]\s*(?:javascript|data):[\s\S]*?['"]/gi, // NOSONAR: S1523 - We are removing javascript: and data: protocols to prevent XSS
    ''
  );
  sanitized = sanitized.replaceAll(
    /\b(?:href|src|action|formaction|xlink:href)\s*=\s*(?:javascript|data):[^\s>]*?(\s|>|$)/gi, // NOSONAR: S1523 - We are removing javascript: and data: protocols to prevent XSS
    ''
  );

  // Remove style tags and style attributes with potentially dangerous content
  sanitized = sanitized.replaceAll(/<style\b[\s\S]*?<\/style>/gi, '');
  sanitized = sanitized.replaceAll(/\bstyle\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]*)/gi, '');

  // Remove form elements
  sanitized = sanitized.replaceAll(/<form\b[\s\S]*?<\/form>/gi, '');

  // Remove object and embed tags
  sanitized = sanitized.replaceAll(/<(?:object|embed|applet|meta|link|base)\b[\s\S]*?>/gi, '');

  return sanitized.trim();
}

/**
 * Encode URI component to prevent injection in URLs
 */
export function encodeUri(uri: string): string {
  if (typeof uri !== 'string') {
    return '';
  }
  try {
    return encodeURIComponent(uri);
  } catch (error) {
    Logger.error('URI encoding failed', error);
    return '';
  }
}

/**
 * Encode URI for use in href attribute
 */
export function encodeHref(href: string): string {
  if (typeof href !== 'string') {
    return '';
  }

  // Prevent javascript: protocol (including obfuscated versions)
  // We remove control characters and whitespace for the check
  // eslint-disable-next-line no-control-regex
  const protocolCheck = href.replaceAll(/[\x00-\x20]/g, '').toLowerCase();
  const jsProtocol = 'javascript:'; // NOSONAR: S1523 - We are explicitly blocking javascript: protocol to prevent XSS
  if (protocolCheck.startsWith(jsProtocol)) {
    return '';
  }

  // Prevent data: protocol (unless explicitly allowed)
  if (protocolCheck.startsWith('data:text/html')) {
    // NOSONAR: S1523 - We are explicitly blocking data: protocol to prevent XSS
    return '';
  }

  return escapeHtml(href);
}

/**
 * Check if string is safe URL (http, https, or relative)
 */
export function isSafeUrl(url: string): boolean {
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

  // Block dangerous protocols
  if (/^\w+:/.test(trimmed)) {
    return false;
  }

  return true;
}

/**
 * Escape JSON for safe embedding in HTML
 */
export function escapeJson(obj: unknown): string {
  const json = JSON.stringify(obj);
  return escapeHtml(json);
}

/**
 * XSS Protection Utilities
 * HTML escaping and sanitization (pure TypeScript, zero dependencies)
 */
export const XssProtection = {
  escape: escapeHtml,
  sanitize: sanitizeHtml,
  encodeUri,
  encodeHref,
  isSafeUrl,
  escapeJson,
};
