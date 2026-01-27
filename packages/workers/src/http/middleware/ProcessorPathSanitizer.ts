import { Logger, NodeSingletons, type IRequest, type IResponse } from '@zintrust/core';

export type RouteHandler = (req: IRequest, res: IResponse) => Promise<void> | void;

const PROCESSOR_PATH_PATTERN = /^[a-zA-Z0-9/_.-]+\.(ts|js)$/;

const decodeProcessorPath = (processor: string): string => {
  return processor
    .replaceAll('&#x2F;', '/') // HTML hex entity for /
    .replaceAll('%2F', '/') // URL encoding for /
    .replaceAll('&#x2E;', '.') // HTML hex entity for .
    .replaceAll('%2E', '.') // URL encoding for .
    .replaceAll('&#x5F;', '_') // HTML hex entity for _
    .replaceAll('%5F', '_') // URL encoding for _
    .replaceAll('&#x2D;', '-') // HTML hex entity for -
    .replaceAll('%2D', '-'); // URL encoding for -
};

export const withProcessorPathValidation = (handler: RouteHandler): RouteHandler => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    try {
      const data = req.data();
      let processor = data['processor'] as string;

      if (!processor) {
        return res.setStatus(400).json({
          error: 'Processor path is required',
          code: 'MISSING_PROCESSOR_PATH',
        });
      }

      // Decode URL-encoded characters
      processor = decodeProcessorPath(processor);

      // Trim whitespace
      processor = processor.trim();

      // Prevent path traversal
      if (processor.includes('..') || processor.startsWith('/')) {
        return res.setStatus(400).json({
          error: 'Invalid processor path',
          message: 'Processor path must be relative and cannot contain path traversal',
          code: 'INVALID_PROCESSOR_PATH',
        });
      }

      if (!PROCESSOR_PATH_PATTERN.test(processor)) {
        Logger.error('Processor path validation failed', {
          processor,
          pattern: PROCESSOR_PATH_PATTERN.toString(),
          testResult: PROCESSOR_PATH_PATTERN.test(processor),
        });
        return res.setStatus(400).json({
          error: 'Invalid processor path',
          message: `Processor must be a TypeScript or JavaScript file. Got: "${processor}"`,
          code: 'INVALID_PROCESSOR_EXTENSION',
        });
      }

      // Sanitize the processor path (remove any invalid characters just in case)
      const sanitizedProcessor = processor.replaceAll(/[^a-zA-Z0-9/_.-]/g, '');
      const path = NodeSingletons.path;
      // Ensure resolved path stays within repository/app scope
      const BASE_PROCESSOR_DIR = path.resolve(process.cwd());
      const resolved = path.resolve(BASE_PROCESSOR_DIR, sanitizedProcessor);
      if (!resolved.startsWith(BASE_PROCESSOR_DIR)) {
        return res.setStatus(400).json({
          error: 'Invalid processor path',
          message: 'Processor path resolves outside of allowed base directory',
          code: 'INVALID_PROCESSOR_PATH_TRAVERSAL',
        });
      }

      const currentBody = req.getBody() as Record<string, unknown>;
      req.setBody({ ...currentBody, processor: sanitizedProcessor });

      return handler(req, res);
    } catch (error) {
      Logger.error('Processor path validation failed', error);
      return res.setStatus(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};
