import {
  MultipartParserRegistry,
  NodeSingletons,
  type MultipartFieldValue,
  type MultipartParseInput,
  type ParsedMultipartData,
  type UploadedFile,
} from '@zintrust/core';
import Busboy from 'busboy';

export type StreamingMultipartParserOptions = {
  /**
   * Where uploaded files are buffered.
   * Defaults to `os.tmpdir()/zintrust/uploads`.
   */
  tmpDir?: string;

  /**
   * Prefix for generated filenames.
   */
  filenamePrefix?: string;
};

const defaultTmpDir = (): string =>
  NodeSingletons.path.join(NodeSingletons.os.tmpdir(), 'zintrust', 'uploads');

const ensureDir = async (dir: string): Promise<void> => {
  await NodeSingletons.fs.fsPromises.mkdir(dir, { recursive: true });
};

const safeUnlink = async (filePath: string): Promise<void> => {
  try {
    await NodeSingletons.fs.fsPromises.unlink(filePath);
  } catch {
    // best-effort
  }
};

const addFieldValue = (
  fields: Record<string, MultipartFieldValue>,
  name: string,
  value: string
): void => {
  const existing = fields[name];
  if (existing === undefined) {
    fields[name] = value;
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }
  fields[name] = [existing, value];
};

const makeTmpFilename = (input: { prefix: string; originalName: string }): string => {
  // Avoid trusting originalName for filesystem paths.
  const uuid =
    typeof globalThis?.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : NodeSingletons.randomBytes(16).toString('hex');
  const base = `${input.prefix}${uuid}`;
  const ext = ((): string => {
    const normalized = input.originalName.trim();
    const idx = normalized.lastIndexOf('.');
    if (idx <= 0) return '';
    const raw = normalized.slice(idx).toLowerCase();
    // Keep extension length bounded.
    if (raw.length > 12) return '';
    if (!/^[.][a-z0-9]+$/.test(raw)) return '';
    return raw;
  })();

  return `${base}${ext}`;
};

type BusboyContext = {
  fields: Record<string, MultipartFieldValue>;
  files: Record<string, UploadedFile[]>;
  createdPaths: Set<string>;
  finished: boolean;
  rejectOnce: (err: unknown) => void;
  opts: Required<Pick<StreamingMultipartParserOptions, 'tmpDir' | 'filenamePrefix'>>;
};

const handleFileUpload = (
  fieldName: string,
  fileStream: NodeJS.ReadableStream,
  info: Busboy.FileInfo,
  ctx: BusboyContext
): void => {
  const originalName = info.filename ?? '';
  const mimeType = info.mimeType ?? 'application/octet-stream';
  const encoding = info.encoding;

  const filename = makeTmpFilename({
    prefix: ctx.opts.filenamePrefix,
    originalName,
  });

  const tmpPath = NodeSingletons.path.join(ctx.opts.tmpDir, filename);
  ctx.createdPaths.add(tmpPath);

  const writeStream = NodeSingletons.fs.createWriteStream(tmpPath, { flags: 'wx' });

  let size = 0;
  const sha256 = NodeSingletons.createHash('sha256');

  fileStream.on('data', (chunk: Buffer) => {
    size += chunk.length;
    sha256.update(chunk);
  });

  fileStream.on('limit', () => {
    fileStream.unpipe(writeStream);
    try {
      writeStream.destroy();
    } catch {
      // best-effort
    }
    ctx.rejectOnce(new Error('File too large'));
  });

  writeStream.on('error', (err) => {
    ctx.rejectOnce(err);
  });

  const uploadedFile: UploadedFile = {
    fieldName,
    originalName,
    mimeType,
    encoding,
    size: 0,
    path: tmpPath,
    stream: () =>
      NodeSingletons.fs.createReadStream(tmpPath) as unknown as NodeSingletons.fs.ReadStream,
    cleanup: async () => {
      await safeUnlink(tmpPath);
      ctx.createdPaths.delete(tmpPath);
    },
  };

  ctx.files[fieldName] ??= [];
  ctx.files[fieldName]?.push(uploadedFile);

  writeStream.on('close', () => {
    uploadedFile.size = size;
    // Expose hash for advanced validation without reading into memory.
    (uploadedFile as unknown as { sha256?: string }).sha256 = sha256.digest('hex');
  });

  fileStream.pipe(writeStream);
};

const setupBusboyHandlers = (bb: Busboy.Busboy, ctx: BusboyContext): void => {
  bb.on('field', (name: string, value: string) => {
    addFieldValue(ctx.fields, name, value);
  });

  bb.on('file', (fieldName: string, fileStream: NodeJS.ReadableStream, info: Busboy.FileInfo) => {
    handleFileUpload(fieldName, fileStream, info, ctx);
  });

  bb.on('filesLimit', () => ctx.rejectOnce(new Error('Too many files')));
  bb.on('fieldsLimit', () => ctx.rejectOnce(new Error('Too many fields')));
  bb.on('partsLimit', () => ctx.rejectOnce(new Error('Too many parts')));
  bb.on('error', (err: Error) => ctx.rejectOnce(err));
};

const createBusboyInstance = (input: MultipartParseInput): Busboy.Busboy => {
  return Busboy({
    headers: input.req.headers,
    limits: {
      fileSize: input.limits.maxFileSizeBytes,
      files: input.limits.maxFiles,
      fields: input.limits.maxFields,
      fieldSize: input.limits.maxFieldSizeBytes,
    },
  });
};

const createSettlementHandlers = (
  createdPaths: Set<string>
): {
  resolveOnce: (value: ParsedMultipartData, resolve: (v: ParsedMultipartData) => void) => void;
  rejectOnce: (err: unknown, reject: (e: unknown) => void) => void;
  isSettled: () => boolean;
} => {
  let settled = false;

  const cleanupAll = async (): Promise<void> => {
    await Promise.allSettled(Array.from(createdPaths).map((p) => safeUnlink(p)));
  };

  return {
    resolveOnce: (value: ParsedMultipartData, resolve: (v: ParsedMultipartData) => void): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    },
    rejectOnce: (err: unknown, reject: (e: unknown) => void): void => {
      if (settled) return;
      settled = true;
      cleanupAll()
        .finally(() => reject(err))
        .catch(() => {
          // Ignore cleanup errors during rejection
        });
    },
    isSettled: () => settled,
  };
};

const executeParsing = (
  input: MultipartParseInput,
  opts: Required<Pick<StreamingMultipartParserOptions, 'tmpDir' | 'filenamePrefix'>>,
  fields: Record<string, MultipartFieldValue>,
  files: Record<string, UploadedFile[]>,
  createdPaths: Set<string>,
  resolve: (value: ParsedMultipartData) => void,
  reject: (err: unknown) => void
): void => {
  let finished = false;
  const settlement = createSettlementHandlers(createdPaths);

  const resolveOnce = (value: ParsedMultipartData): void => {
    settlement.resolveOnce(value, resolve);
  };

  const rejectOnce = (err: unknown): void => {
    settlement.rejectOnce(err, reject);
  };

  const bb = createBusboyInstance(input);

  const onAbortOrClose = (): void => {
    if (finished) return;
    rejectOnce(new Error('Upload aborted'));
  };

  input.req.once('aborted', onAbortOrClose);
  input.req.once('close', onAbortOrClose);

  const ctx: BusboyContext = {
    fields,
    files,
    createdPaths,
    finished: false,
    rejectOnce,
    opts,
  };

  setupBusboyHandlers(bb, ctx);

  bb.on('finish', () => {
    finished = true;
    ctx.finished = true;
    resolveOnce({ fields, files });
  });

  try {
    input.req.pipe(bb);
  } catch (err) {
    rejectOnce(err);
  }
};

const parseWithBusboy = async (
  input: MultipartParseInput,
  opts: Required<Pick<StreamingMultipartParserOptions, 'tmpDir' | 'filenamePrefix'>>
): Promise<ParsedMultipartData> => {
  await ensureDir(opts.tmpDir);

  const fields: Record<string, MultipartFieldValue> = {};
  const files: Record<string, UploadedFile[]> = {};
  const createdPaths = new Set<string>();

  return new Promise<ParsedMultipartData>((resolve, reject) => {
    executeParsing(input, opts, fields, files, createdPaths, resolve, reject);
  });
};

export function registerStreamingMultipartParser(
  options: StreamingMultipartParserOptions = {}
): void {
  const tmpDir = options.tmpDir ?? defaultTmpDir();
  const filenamePrefix = options.filenamePrefix ?? 'upload-';

  MultipartParserRegistry.register((input) => parseWithBusboy(input, { tmpDir, filenamePrefix }));
}
