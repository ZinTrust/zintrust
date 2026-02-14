/**
 * File Upload Handler
 * Handles multipart/form-data file uploads with validation and storage integration
 */

import type { ReadableOptions } from '@/node-singletons/stream';
import type { IRequest } from '@http/Request';

type Streamer = ReadableOptions | NodeJS.ReadableStream;

export interface UploadedFile {
  fieldName: string;
  originalName: string;
  mimeType: string;
  size: number;
  encoding?: string;

  /**
   * Legacy in-memory payload (Phase 3). Optional in Phase 4.
   */
  buffer?: Buffer;

  /**
   * Disk-backed upload path (Phase 4, provided by @zintrust/storage).
   */
  path?: string;

  /**
   * Returns a fresh readable stream for the uploaded content.
   */
  stream?: () => Streamer;

  /**
   * Optional cleanup hook (e.g., delete temp file after response).
   */
  cleanup?: () => Promise<void>;
}

export interface FileUploadOptions {
  maxSize?: number; // bytes, default 10MB
  mimeTypes?: string[]; // allowed MIME types, default all
  required?: boolean;
}

export interface IFileUploadHandler {
  file(fieldName: string, options?: FileUploadOptions): UploadedFile | undefined;
  files(fieldName: string, options?: FileUploadOptions): UploadedFile[];
  hasFile(fieldName: string): boolean;
  validate(): { valid: boolean; errors: Record<string, string[]> };
}

/**
 * Check if MIME type is allowed
 */
const isMimeTypeAllowed = (mimeType: string, allowed?: string[]): boolean => {
  if (!allowed || allowed.length === 0) return true;

  // Support wildcards like "image/*"
  for (const allowedType of allowed) {
    if (allowedType === mimeType) return true;
    if (allowedType.endsWith('/*')) {
      const prefix = allowedType.slice(0, -2);
      if (mimeType.startsWith(prefix + '/')) return true;
    }
  }

  return false;
};

/**
 * Create file upload handler for request
 */
export const createFileUploadHandler = (req: IRequest): IFileUploadHandler => {
  // Files would be extracted from multipart/form-data parsing
  // This is a placeholder structure - actual implementation depends on
  // how multipart data is parsed and stored on the request

  const uploadedFiles: Map<string, UploadedFile[]> = new Map();

  // Extract files from request if available
  const requestBody = req.getBody?.();
  if (typeof requestBody === 'object' && requestBody !== null && '__files' in requestBody) {
    const filesData = (requestBody as { __files?: unknown }).__files;
    if (typeof filesData === 'object' && filesData !== null) {
      for (const [fieldName, files] of Object.entries(filesData)) {
        if (Array.isArray(files)) {
          uploadedFiles.set(fieldName, files as UploadedFile[]);
        }
      }
    }
  }

  return {
    file(fieldName: string, options?: FileUploadOptions): UploadedFile | undefined {
      const files = uploadedFiles.get(fieldName);
      if (!files || files.length === 0) return undefined;

      const file = files[0];

      // Validate MIME type
      if (!isMimeTypeAllowed(file.mimeType, options?.mimeTypes)) {
        return undefined;
      }

      // Validate size
      const maxSize = options?.maxSize ?? 10 * 1024 * 1024; // 10MB default
      if (file.size > maxSize) {
        return undefined;
      }

      return file;
    },

    files(fieldName: string, options?: FileUploadOptions): UploadedFile[] {
      const files = uploadedFiles.get(fieldName) ?? [];

      return files.filter((file) => {
        // Validate MIME type
        if (!isMimeTypeAllowed(file.mimeType, options?.mimeTypes)) {
          return false;
        }

        // Validate size
        const maxSize = options?.maxSize ?? 10 * 1024 * 1024; // 10MB default
        if (file.size > maxSize) {
          return false;
        }

        return true;
      });
    },

    hasFile(fieldName: string): boolean {
      const files = uploadedFiles.get(fieldName);
      return files !== undefined && files.length > 0;
    },

    validate(): { valid: boolean; errors: Record<string, string[]> } {
      const errors: Record<string, string[]> = {};
      return { valid: Object.keys(errors).length === 0, errors };
    },
  };
};

export const FileUpload = Object.freeze({
  /**
   * Create handler for request
   */
  createHandler(req: IRequest): IFileUploadHandler {
    return createFileUploadHandler(req);
  },

  /**
   * Validate uploaded files
   */
  validateFiles(
    files: UploadedFile[],
    options: {
      required?: boolean;
      minCount?: number;
      maxCount?: number;
      mimeTypes?: string[];
      maxSize?: number;
    }
  ): { valid: boolean; error?: string } {
    if (options.required === true && files.length === 0) {
      return { valid: false, error: 'At least one file is required' };
    }

    if (typeof options.minCount === 'number' && files.length < options.minCount) {
      return { valid: false, error: `At least ${options.minCount} files required` };
    }

    if (typeof options.maxCount === 'number' && files.length > options.maxCount) {
      return { valid: false, error: `Maximum ${options.maxCount} files allowed` };
    }

    for (const file of files) {
      if (!isMimeTypeAllowed(file.mimeType, options.mimeTypes)) {
        return { valid: false, error: `File type not allowed: ${file.mimeType}` };
      }

      const maxSize = options.maxSize ?? 10 * 1024 * 1024;
      if (file.size > maxSize) {
        return {
          valid: false,
          error: `File too large: ${file.originalName} (${file.size} bytes)`,
        };
      }
    }

    return { valid: true };
  },
});

export default FileUpload;
