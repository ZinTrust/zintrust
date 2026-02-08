import {
  Logger,
  NodeSingletons,
  workersConfig,
  type IRequest,
  type IResponse,
} from '@zintrust/core';

export type RouteHandler = (req: IRequest, res: IResponse) => Promise<void> | void;

const PROCESSOR_PATH_PATTERN = /^[a-zA-Z0-9/_.-]+\.(ts|js|mjs|cjs)$/;

const isUrlSpec = (value: string): boolean => {
  if (value.startsWith('url:')) return true;
  return value.includes('://');
};

const normalizeUrlSpec = (value: string): string => {
  return value.startsWith('url:') ? value.slice(4) : value;
};

const isAllowedRemoteHost = (host: string): boolean => {
  const allowlist = workersConfig.processorSpec.remoteAllowlist;
  return allowlist.map((value) => value.toLowerCase()).includes(host.toLowerCase());
};

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

const validateUrlSpec = (
  processor: string
): { isValid: boolean; error?: { error: string; code: string } } => {
  const normalized = normalizeUrlSpec(processor);
  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch {
    return {
      isValid: false,
      error: { error: 'Invalid processor url', code: 'INVALID_PROCESSOR_URL' },
    };
  }

  if (parsed.protocol === 'file:') {
    const path = NodeSingletons.path;
    const baseDir = path.resolve(process.cwd());
    const resolved = path.resolve(baseDir, decodeURIComponent(parsed.pathname));

    if (!resolved.startsWith(baseDir)) {
      return {
        isValid: false,
        error: { error: 'Invalid processor path', code: 'INVALID_PROCESSOR_PATH_TRAVERSAL' },
      };
    }
  } else {
    if (parsed.protocol !== 'https:') {
      return {
        isValid: false,
        error: { error: 'Invalid processor url', code: 'INVALID_PROCESSOR_URL' },
      };
    }

    if (!isAllowedRemoteHost(parsed.host)) {
      return {
        isValid: false,
        error: { error: 'Invalid processor url host', code: 'INVALID_PROCESSOR_URL_HOST' },
      };
    }
  }

  return { isValid: true };
};

const validateRelativePath = (
  processor: string
): { isValid: boolean; error?: { error: string; code: string } } => {
  if (processor.includes('..') || processor.startsWith('/')) {
    return {
      isValid: false,
      error: { error: 'Invalid processor path', code: 'INVALID_PROCESSOR_PATH' },
    };
  }

  if (!PROCESSOR_PATH_PATTERN.test(processor)) {
    return {
      isValid: false,
      error: { error: 'Invalid processor path', code: 'INVALID_PROCESSOR_EXTENSION' },
    };
  }

  return { isValid: true };
};

const sanitizeAndResolvePath = (processor: string): { isValid: boolean; sanitized: string } => {
  const sanitizedProcessor = processor.replaceAll(/[^a-zA-Z0-9/_.-]/g, '');
  const path = NodeSingletons.path;
  const baseDir = path.resolve(process.cwd());
  const resolved = path.resolve(baseDir, sanitizedProcessor);

  if (!resolved.startsWith(baseDir)) {
    return { isValid: false, sanitized: processor };
  }

  return { isValid: true, sanitized: sanitizedProcessor };
};

export const withProcessorPathValidation = (handler: RouteHandler): RouteHandler => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    try {
      const data = req.data();
      let processor = data['processor'] as string;

      if (!processor) {
        return res.setStatus(400).json({
          error: 'Processor spec is required',
          code: 'MISSING_PROCESSOR_SPEC',
        });
      }

      // Decode URL-encoded characters
      processor = decodeProcessorPath(processor);

      // Trim whitespace
      processor = processor.trim();

      const isUrl = isUrlSpec(processor);
      let validation: { isValid: boolean; error?: { error: string; code: string } };

      if (isUrl) {
        validation = validateUrlSpec(processor);
      } else {
        validation = validateRelativePath(processor);

        if (validation.isValid) {
          const pathValidation = sanitizeAndResolvePath(processor);
          if (pathValidation.isValid) {
            processor = pathValidation.sanitized;
          } else {
            validation = {
              isValid: false,
              error: { error: 'Invalid processor path', code: 'INVALID_PROCESSOR_PATH_TRAVERSAL' },
            };
          }
        }
      }

      if (!validation.isValid) {
        return res.setStatus(400).json(validation.error);
      }

      const currentBody = req.getBody() as Record<string, unknown>;
      req.setBody({ ...currentBody, processor });

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
