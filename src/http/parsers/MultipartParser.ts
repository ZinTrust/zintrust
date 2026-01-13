/**
 * Multipart Form-Data Parser
 * Parses multipart/form-data requests for file uploads and form fields
 */

import type { UploadedFile } from '@http/FileUpload';

interface ParsedMultipartData {
  fields: Record<string, string | string[]>;
  files: Record<string, UploadedFile[]>;
}

const MAX_PARTS = 1000;
const MAX_HEADER_SIZE = 16 * 1024; // 16KB

/**
 * Simple multipart boundary extractor
 */
const getBoundary = (contentType: string): string | undefined => {
  const match = /boundary=([^;\s]+)/.exec(contentType);
  if (match?.[1] === undefined) return undefined;
  return match[1].replaceAll('"', '');
};

const stripTrailingNewline = (buffer: Buffer, start: number, end: number): number => {
  if (end <= start) return end;

  if (end - start >= 2 && buffer[end - 2] === 13 && buffer[end - 1] === 10) {
    return end - 2;
  }

  if (end - start >= 1 && buffer[end - 1] === 10) {
    return end - 1;
  }

  return end;
};

/**
 * Extract parts from multipart body by boundary
 */
const extractParts = (bodyBuffer: Buffer, boundary: string): Buffer[] => {
  const parts: Buffer[] = [];

  if (!boundary) return parts;

  const boundaryBuffer = Buffer.from(`--${boundary}`);

  let currentPos = 0;
  while (currentPos < bodyBuffer.length) {
    if (parts.length >= MAX_PARTS) break;

    const boundaryPos = bodyBuffer.indexOf(boundaryBuffer, currentPos);
    if (boundaryPos === -1) break;

    const start = currentPos + (currentPos === 0 ? 0 : 2); // Skip CRLF before boundary
    const end = stripTrailingNewline(bodyBuffer, start, boundaryPos);

    if (start < end) {
      parts.push(bodyBuffer.subarray(start, end));
    }

    currentPos = boundaryPos + boundaryBuffer.length;
  }

  return parts;
};

/**
 * Parse a single multipart part
 */
const getHeaderInfo = (part: Buffer): { headerSection: string; bodyStart: number } | undefined => {
  // Find headers/body separator (double CRLF or double LF)
  const headerEndIdx = part.indexOf(Buffer.from('\r\n\r\n'));
  const headerEndIdx2 = part.indexOf(Buffer.from('\n\n'));
  const headerEnd = headerEndIdx >= 0 ? headerEndIdx : headerEndIdx2;

  if (headerEnd === -1) return undefined;
  if (headerEnd > MAX_HEADER_SIZE) return undefined; // Header too large, ignore part

  const headerSection = part.subarray(0, headerEnd).toString('utf-8');
  const bodyStart = headerEnd + (headerEndIdx >= 0 ? 4 : 2);

  return { headerSection, bodyStart };
};

const getContentDisposition = (
  headerSection: string
): { fieldName: string; fileName?: string } | undefined => {
  const match = /Content-Disposition: form-data; name="([^"]+)"(?:; filename="([^"]*)")?/i.exec(
    headerSection
  );

  if (!match) return undefined;

  return { fieldName: match[1] ?? '', fileName: match[2] };
};

const addFile = (
  part: Buffer,
  headerSection: string,
  bodyStart: number,
  fieldName: string,
  fileName: string,
  result: ParsedMultipartData
): void => {
  const contentTypeMatch = /Content-Type: ([^\r\n]+)/i.exec(headerSection);
  const mimeType = contentTypeMatch?.[1] ?? 'application/octet-stream';

  // CRITICAL: Use buffer subarray directly for zero-copy and to prevent binary corruption via trim()
  const buffer = part.subarray(bodyStart);

  const file: UploadedFile = {
    fieldName,
    originalName: fileName,
    mimeType,
    buffer,
    size: buffer.length,
  };

  result.files[fieldName] ??= [];
  result.files[fieldName].push(file);
};

const addField = (partBody: string, fieldName: string, result: ParsedMultipartData): void => {
  const fieldValue = result.fields[fieldName];
  if (fieldValue === undefined) {
    result.fields[fieldName] = partBody;
  } else if (Array.isArray(fieldValue)) {
    fieldValue.push(partBody);
  } else {
    result.fields[fieldName] = [fieldValue, partBody];
  }
};

const parsePart = (part: Buffer, result: ParsedMultipartData): void => {
  if (part.length === 0) return;

  const headerInfo = getHeaderInfo(part);
  if (!headerInfo) return;
  // OPTIMIZATION: Do not convert body to string yet, as it might be a binary file

  const disposition = getContentDisposition(headerInfo.headerSection);
  if (!disposition) return;

  if (disposition.fileName !== undefined && disposition.fileName !== null) {
    addFile(
      part,
      headerInfo.headerSection,
      headerInfo.bodyStart,
      disposition.fieldName,
      disposition.fileName,
      result
    );
    return;
  }

  // Regular form field - safe to convert to string and trim
  const partBody = part.subarray(headerInfo.bodyStart).toString('utf-8').trim();
  addField(partBody, disposition.fieldName, result);
};

/**
 * Parse multipart/form-data body
 * Note: This is a simplified parser. For production use a proper multipart library
 */
export const parseMultipartFormData = (
  body: Buffer | string,
  boundary: string
): ParsedMultipartData => {
  const result: ParsedMultipartData = { fields: {}, files: {} };

  if (!boundary) return result;

  const bodyBuffer = typeof body === 'string' ? Buffer.from(body) : body;
  const parts = extractParts(bodyBuffer, boundary);

  for (const part of parts) {
    parsePart(part, result);
  }

  return result;
};

/**
 * Parse multipart/form-data from request
 */
export const MultipartParser = Object.freeze({
  /**
   * Check if content-type is multipart/form-data
   */
  isMultipart(contentType: string): boolean {
    return contentType.includes('multipart/form-data');
  },

  /**
   * Get boundary from content-type header
   */
  getBoundary(contentType: string): string | undefined {
    return getBoundary(contentType);
  },

  /**
   * Parse multipart body
   */
  parse(body: Buffer | string, boundary: string): ParsedMultipartData {
    return parseMultipartFormData(body, boundary);
  },
});

export default MultipartParser;
