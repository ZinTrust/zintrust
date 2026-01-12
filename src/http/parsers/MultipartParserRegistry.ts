import type { UploadedFile } from '@http/FileUpload';
import type { IncomingMessage } from '@node-singletons/http';

export type MultipartFieldValue = string | string[];

export type ParsedMultipartData = {
  fields: Record<string, MultipartFieldValue>;
  files: Record<string, UploadedFile[]>;
};

export type MultipartParseInput = {
  req: IncomingMessage;
  contentType: string;

  /**
   * Limits are enforced by the parser implementation.
   * Core provides defaults via env vars, but the parser may choose stricter behavior.
   */
  limits: {
    maxFileSizeBytes: number;
    maxFiles: number;
    maxFields: number;
    maxFieldSizeBytes: number;
  };
};

export type MultipartParserProvider = (input: MultipartParseInput) => Promise<ParsedMultipartData>;

let provider: MultipartParserProvider | null = null;

function register(next: MultipartParserProvider): void {
  provider = next;
}

function get(): MultipartParserProvider | null {
  return provider;
}

function has(): boolean {
  return provider !== null;
}

function clear(): void {
  provider = null;
}

export const MultipartParserRegistry = Object.freeze({
  register,
  get,
  has,
  clear,
});

export default MultipartParserRegistry;
