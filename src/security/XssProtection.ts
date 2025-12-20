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
  return text.replaceAll(/[&<>"'/]/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Sanitize HTML by removing dangerous tags and attributes
 */
export function sanitizeHtml(html: string): string {
  if (typeof html !== 'string') {
    return '';
  }

  // Remove script tags and content
  let sanitized = html.replaceAll(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove iframe tags
  sanitized = sanitized.replaceAll(/<iframe\b[^>]*(?:(?!<\/iframe>)[^>])*>/gi, '');

  // Remove event handlers
  sanitized = sanitized.replaceAll(/\s*on\w+\s*=\s*['"][^'"]*['"]/gi, '');
  sanitized = sanitized.replaceAll(/\s*on\w+\s*=\s*[^\s>]*/gi, '');

  // Remove style tags with potentially dangerous content
  sanitized = sanitized.replaceAll(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove form elements
  sanitized = sanitized.replaceAll(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '');

  // Remove object and embed tags
  sanitized = sanitized.replaceAll(/<(?:object|embed|applet|meta|link|base)\b[^>]*>/gi, '');

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

  // Prevent javascript: protocol
  if (new RegExp(/^\s*javascript:/i).exec(href) !== null) {
    return '';
  }

  // Prevent data: protocol (unless explicitly allowed)
  if (new RegExp(/^\s*data:text\/html/i).exec(href) !== null) {
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
  if (new RegExp(/^\w+:/).exec(trimmed) !== null) {
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
