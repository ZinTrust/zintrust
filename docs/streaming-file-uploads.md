# Streaming File Uploads

ZinTrust implements a **stream-first architecture** for handling HTTP request bodies, designed for memory efficiency, security, and scalability. The framework never buffers entire request bodies in memory at the server layer, instead delegating parsing to specialized middleware components.

## Architecture Overview

### Phase 4: Stream-First Design

The HTTP server layer (`src/boot/Server.ts`) **does not read or buffer request bodies**. Instead:

1. **Server Layer**: Creates request/response wrappers and delegates to the Kernel
2. **Middleware Pipeline**: Body parsing happens in middleware with strict size limits
3. **Pluggable Parsers**: Multipart handling is opt-in via a registry pattern

This design provides:

- **Memory Safety**: Large uploads don't exhaust server RAM
- **Early Rejection**: Oversized payloads are rejected before full buffering
- **Flexibility**: Applications can choose disk-backed or memory-backed strategies
- **Security**: Built-in limits prevent denial-of-service attacks

### Request Body Flow

```
Raw HTTP Request
    ↓
Server Layer (no buffering)
    ↓
Kernel Middleware Pipeline
    ↓
BodyParsingMiddleware (JSON/text/urlencoded)
    ↓
FileUploadMiddleware (multipart/form-data)
    ↓
CSRF Middleware
    ↓
Validation Middleware
    ↓
Route Handler
```

## Core Behavior by Content-Type

### `application/json`

**Handled by**: `bodyParsingMiddleware`

**Default Limit**: `MAX_JSON_SIZE` = 1 MB (1,048,576 bytes)

**Behavior**:

- Reads request body in chunks with size enforcement
- Rejects requests exceeding `MAX_JSON_SIZE` with `413 Payload Too Large`
- Parses JSON and stores result in `req.body`
- Returns `400 Invalid JSON body` for malformed JSON
- Stores raw bytes in `req.context.rawBodyBytes` for signature verification

**Example**:

```ts
Router.post(router, '/api/data', async (req, res) => {
  const body = req.getBody(); // Already parsed JSON object
  const rawBytes = req.context.rawBodyBytes; // Raw Buffer for HMAC/signing

  res.json({ received: body });
});
```

### `text/*` and `application/x-www-form-urlencoded`

**Handled by**: `bodyParsingMiddleware`

**Default Limit**: `MAX_BODY_SIZE` = 10 MB (10,485,760 bytes)

**Behavior**:

- Reads body with size enforcement
- URL-encoded forms are parsed into key-value objects
- Repeated keys become arrays: `a=1&a=2` → `{ a: ['1', '2'] }`
- Plain text is preserved as string

**Example**:

```ts
Router.post(router, '/contact', async (req, res) => {
  const { name, email, message } = req.getBody() as {
    name: string;
    email: string;
    message: string;
  };

  // Validation middleware already ran; data is sanitized
  res.json({ success: true });
});
```

### `multipart/form-data`

**Handled by**: `fileUploadMiddleware` + external parser

**Default Behavior**: Returns `415 Unsupported Media Type` unless parser is registered

**Why External?**

- Multipart parsing requires dependency (`busboy`)
- Applications without file uploads shouldn't pay bundle cost
- Enables alternative implementations (S3 direct upload, etc.)

## Enable Streaming Multipart Uploads

### Installation

```bash
npm install @zintrust/storage
```

The `@zintrust/storage` package provides:

- **Streaming parser** using `busboy` (battle-tested multipart library)
- **Disk-backed uploads** to avoid memory exhaustion
- **SHA-256 hashing** for file integrity verification
- **Safe cleanup** with automatic temp file management

### Registration

Register the parser **before** starting the server:

```ts
import { Application } from '@zintrust/core';
import { registerStreamingMultipartParser } from '@zintrust/storage/register';

// Register the streaming multipart parser
registerStreamingMultipartParser({
  tmpDir: '/tmp/zintrust/uploads', // Optional: custom temp directory
  filenamePrefix: 'upload-', // Optional: temp filename prefix
});

const app = Application.create();
await app.boot();

const server = Server.create(app);
await server.listen();
```

**Important**: Call `registerStreamingMultipartParser()` once during application bootstrap, not per-request.

## Environment Limits

Configure upload limits via environment variables:

```bash
# JSON request bodies (default: 1MB)
MAX_JSON_SIZE=2097152        # 2MB

# Text and URL-encoded bodies (default: 10MB)
MAX_BODY_SIZE=10485760

# Individual file size (default: 50MB)
MAX_FILE_SIZE=52428800

# Maximum number of files per request (default: 20)
MAX_FILES=20

# Maximum number of form fields (default: 200)
MAX_FIELDS=200

# Maximum size per form field in bytes (default: 128KB)
MAX_FIELD_SIZE=131072
```

### Recommended Production Limits

```bash
# API-only applications
MAX_JSON_SIZE=1048576        # 1MB
MAX_BODY_SIZE=2097152        # 2MB
MAX_FILE_SIZE=0              # Disable file uploads

# File upload applications
MAX_JSON_SIZE=1048576        # 1MB
MAX_BODY_SIZE=10485760       # 10MB
MAX_FILE_SIZE=104857600      # 100MB
MAX_FILES=10
MAX_FIELDS=100
MAX_FIELD_SIZE=65536         # 64KB
```

## Accessing Uploaded Files

### Single File Upload

```ts
import { Router, type IRequest, type IResponse } from '@zintrust/core';

Router.post(router, '/upload/avatar', async (req: IRequest, res: IResponse) => {
  const file = req.file('avatar');

  if (!file) {
    return res.setStatus(400).json({ error: 'No file uploaded' });
  }

  // Validate file type
  if (!file.mimeType.startsWith('image/')) {
    return res.setStatus(400).json({ error: 'Only images allowed' });
  }

  // Validate file size (additional check beyond MAX_FILE_SIZE)
  if (file.size > 5 * 1024 * 1024) {
    return res.setStatus(400).json({ error: 'Image must be under 5MB' });
  }

  // File is now on disk at file.path
  console.log('Uploaded to:', file.path);
  console.log('Original name:', file.originalName);
  console.log('MIME type:', file.mimeType);
  console.log('Size:', file.size);

  // Process the file (e.g., move to permanent storage)
  const newPath = `/var/uploads/${Date.now()}-${file.originalName}`;
  await fs.promises.rename(file.path, newPath);

  return res.json({
    success: true,
    file: {
      name: file.originalName,
      size: file.size,
      type: file.mimeType,
      url: `/uploads/${path.basename(newPath)}`,
    },
  });
});
```

### Multiple Files Upload

```ts
Router.post(router, '/upload/gallery', async (req: IRequest, res: IResponse) => {
  const files = req.files('photos');

  if (files.length === 0) {
    return res.setStatus(400).json({ error: 'No files uploaded' });
  }

  if (files.length > 10) {
    return res.setStatus(400).json({ error: 'Maximum 10 files allowed' });
  }

  const processed = [];

  for (const file of files) {
    // Validate each file
    if (!file.mimeType.startsWith('image/')) {
      // Clean up all uploaded files on validation failure
      await Promise.all(files.map((f) => f.cleanup?.()));
      return res.setStatus(400).json({ error: 'Only images allowed' });
    }

    // Move to permanent storage
    const newPath = `/var/uploads/${Date.now()}-${file.originalName}`;
    await fs.promises.rename(file.path, newPath);

    processed.push({
      name: file.originalName,
      size: file.size,
      url: `/uploads/${path.basename(newPath)}`,
    });
  }

  return res.json({ success: true, files: processed });
});
```

### Streaming Large Files

For very large files, process them as streams without loading into memory:

```ts
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

Router.post(router, '/upload/backup', async (req: IRequest, res: IResponse) => {
  const file = req.file('backup');

  if (!file?.stream) {
    return res.setStatus(400).json({ error: 'No file uploaded' });
  }

  try {
    const destination = `/backups/${Date.now()}.tar.gz`;

    // Stream and compress without loading into memory
    await pipeline(file.stream(), createGzip(), createWriteStream(destination));

    // Clean up temp file
    await file.cleanup?.();

    return res.json({ success: true, path: destination });
  } catch (error) {
    await file.cleanup?.();
    return res.setStatus(500).json({ error: 'Upload failed' });
  }
});
```

### Mixed Form Fields and Files

```ts
Router.post(router, '/upload/document', async (req: IRequest, res: IResponse) => {
  const body = req.getBody() as {
    title: string;
    description: string;
    category: string;
  };

  const file = req.file('document');

  if (!file) {
    return res.setStatus(400).json({ error: 'No document uploaded' });
  }

  // Validation middleware already sanitized text fields
  console.log('Title:', body.title);
  console.log('Description:', body.description);
  console.log('Category:', body.category);

  // Process file...
  const newPath = `/documents/${Date.now()}-${file.originalName}`;
  await fs.promises.rename(file.path, newPath);

  return res.json({
    success: true,
    document: {
      title: body.title,
      description: body.description,
      category: body.category,
      file: {
        name: file.originalName,
        size: file.size,
        path: newPath,
      },
    },
  });
});
```

## File Upload Type Reference

### `UploadedFile` Interface

```ts
interface UploadedFile {
  /** Form field name (e.g., 'avatar', 'photos') */
  fieldName: string;

  /** Original filename from client (untrusted) */
  originalName: string;

  /** MIME type (e.g., 'image/jpeg') */
  mimeType: string;

  /** File size in bytes */
  size: number;

  /** Character encoding (e.g., '7bit', 'binary') */
  encoding?: string;

  /** Absolute path to temp file (disk-backed uploads) */
  path?: string;

  /** In-memory buffer (legacy, avoid for large files) */
  buffer?: Buffer;

  /** Create a new readable stream */
  stream?: () => Readable;

  /** Clean up temp file (always call this) */
  cleanup?: () => Promise<void>;
}
```

### Request File Methods

```ts
interface IRequest {
  /** Get single file by field name */
  file(fieldName: string, options?: FileUploadOptions): UploadedFile | undefined;

  /** Get all files for a field name */
  files(fieldName: string, options?: FileUploadOptions): UploadedFile[];

  /** Check if file exists */
  hasFile(fieldName: string): boolean;
}
```

## Error Handling

### Common Upload Errors

```ts
Router.post(router, '/upload', async (req: IRequest, res: IResponse) => {
  try {
    const file = req.file('document');

    if (!file) {
      return res.setStatus(400).json({
        error: 'FILE_REQUIRED',
        message: 'No file uploaded',
      });
    }

    // Validate MIME type
    const allowedTypes = ['application/pdf', 'application/msword'];
    if (!allowedTypes.includes(file.mimeType)) {
      await file.cleanup?.();
      return res.setStatus(400).json({
        error: 'INVALID_FILE_TYPE',
        message: 'Only PDF and Word documents allowed',
        allowed: allowedTypes,
      });
    }

    // Validate file size
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      await file.cleanup?.();
      return res.setStatus(400).json({
        error: 'FILE_TOO_LARGE',
        message: `File must be under ${maxSize / 1024 / 1024}MB`,
        size: file.size,
        maxSize,
      });
    }

    // Process file...
    await processFile(file);

    // Always clean up
    await file.cleanup?.();

    return res.json({ success: true });
  } catch (error) {
    console.error('Upload error:', error);
    return res.setStatus(500).json({
      error: 'UPLOAD_FAILED',
      message: 'File upload failed',
    });
  }
});
```

### Handling Upload Limits

When limits are exceeded, the framework automatically rejects requests:

| Limit Exceeded  | Status Code | Response                           |
| --------------- | ----------- | ---------------------------------- |
| `MAX_JSON_SIZE` | 413         | `{ "error": "Payload Too Large" }` |
| `MAX_BODY_SIZE` | 413         | `{ "error": "Payload Too Large" }` |
| `MAX_FILE_SIZE` | 500         | Parser throws `"File too large"`   |
| `MAX_FILES`     | 500         | Parser throws `"Too many files"`   |
| `MAX_FIELDS`    | 500         | Parser throws `"Too many fields"`  |

**Best Practice**: Always validate file size/type in your handler even with middleware limits:

```ts
// Additional validation after middleware limits
if (file.size > 5 * 1024 * 1024) {
  await file.cleanup?.();
  return res.setStatus(400).json({ error: 'File must be under 5MB' });
}
```

## Security Considerations

### 1. Never Trust Original Filename

```ts
// ❌ BAD: Directory traversal vulnerability
const savePath = `/uploads/${file.originalName}`;

// ✅ GOOD: Generate safe filename
import { randomUUID } from 'node:crypto';
const ext = path.extname(file.originalName).toLowerCase();
const safeName = `${randomUUID()}${ext}`;
const savePath = `/uploads/${safeName}`;
```

### 2. Validate MIME Type

```ts
// ❌ BAD: Trust client-provided MIME type
if (file.mimeType === 'image/jpeg') {
  /* ... */
}

// ✅ GOOD: Verify with magic bytes
import { fileTypeFromFile } from 'file-type';

const detected = await fileTypeFromFile(file.path);
if (detected?.mime !== 'image/jpeg') {
  await file.cleanup?.();
  return res.setStatus(400).json({ error: 'Invalid file type' });
}
```

### 3. Scan for Malware

```ts
import { scanFile } from 'your-antivirus-library';

Router.post(router, '/upload', async (req: IRequest, res: IResponse) => {
  const file = req.file('document');
  if (!file?.path) {
    return res.setStatus(400).json({ error: 'No file uploaded' });
  }

  try {
    const scanResult = await scanFile(file.path);

    if (scanResult.infected) {
      await file.cleanup?.();
      return res.setStatus(400).json({
        error: 'MALWARE_DETECTED',
        message: 'File contains malicious content',
      });
    }

    // Safe to process...
  } finally {
    await file.cleanup?.();
  }
});
```

### 4. Implement Rate Limiting

```ts
import { RateLimiter } from '@zintrust/core';

const uploadRateLimit = RateLimiter.create({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 uploads per window
  message: 'Too many uploads, please try again later',
});

Router.post(
  router,
  '/upload',
  async (req, res) => {
    /* ... */
  },
  { middleware: ['auth', uploadRateLimit] }
);
```

### 5. Clean Up Temp Files

**Always** call `file.cleanup()` to prevent disk exhaustion:

```ts
Router.post(router, '/upload', async (req: IRequest, res: IResponse) => {
  const file = req.file('document');
  if (!file) return res.setStatus(400).json({ error: 'No file' });

  try {
    await processFile(file);
    return res.json({ success: true });
  } finally {
    // Always runs, even on error
    await file.cleanup?.();
  }
});
```

## Best Practices

### 1. Use Validation Middleware

Combine with ZinTrust's schema validation:

```ts
import { Schema, Validator, ValidationMiddleware } from '@zintrust/core';

const uploadSchema = Schema.create()
  .required('title')
  .string('title')
  .minLength('title', 1)
  .maxLength('title', 100)
  .required('category')
  .string('category')
  .enum('category', ['document', 'image', 'video']);

Router.post(
  router,
  '/upload',
  async (req, res) => {
    const { title, category } = req.getBody() as { title: string; category: string };
    const file = req.file('document');

    // Validation already passed; fields are sanitized
    // ...
  },
  { middleware: [ValidationMiddleware.createBody(uploadSchema)] }
);
```

### 2. Store Files Outside Web Root

```ts
// ❌ BAD: Uploaded files accessible directly
const uploadDir = '/var/www/public/uploads';

// ✅ GOOD: Files stored outside public directory
const uploadDir = '/var/zintrust/uploads';

// Serve through authenticated route
Router.get(router, '/files/:id', async (req, res) => {
  // Verify user has access to file
  const file = await getFileById(req.params.id);
  if (!file) return res.setStatus(404).json({ error: 'Not found' });

  // Stream file to response
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', String(file.size));

  const stream = createReadStream(file.path);
  stream.pipe(res.getRaw());
});
```

### 3. Implement File Quota

```ts
const getUserQuota = async (userId: string) => {
  const used = await db.query('SELECT SUM(size) as total FROM files WHERE user_id = ?', [userId]);
  return {
    used: used[0]?.total ?? 0,
    limit: 100 * 1024 * 1024, // 100MB per user
  };
};

Router.post(router, '/upload', async (req: IRequest, res: IResponse) => {
  const userId = req.user?.id;
  const file = req.file('document');

  if (!file) return res.setStatus(400).json({ error: 'No file' });

  try {
    const quota = await getUserQuota(userId);

    if (quota.used + file.size > quota.limit) {
      return res.setStatus(400).json({
        error: 'QUOTA_EXCEEDED',
        message: 'Storage quota exceeded',
        used: quota.used,
        limit: quota.limit,
      });
    }

    // Process file...
  } finally {
    await file.cleanup?.();
  }
});
```

### 4. Generate Thumbnails for Images

```ts
import sharp from 'sharp';

Router.post(router, '/upload/image', async (req: IRequest, res: IResponse) => {
  const file = req.file('image');
  if (!file?.path) {
    return res.setStatus(400).json({ error: 'No image uploaded' });
  }

  try {
    const imageId = randomUUID();
    const baseDir = `/var/uploads/images/${imageId}`;
    await fs.promises.mkdir(baseDir, { recursive: true });

    // Original
    const originalPath = `${baseDir}/original${path.extname(file.originalName)}`;
    await fs.promises.rename(file.path, originalPath);

    // Generate thumbnails
    await sharp(originalPath).resize(200, 200, { fit: 'cover' }).toFile(`${baseDir}/thumb.jpg`);

    await sharp(originalPath).resize(800, 800, { fit: 'inside' }).toFile(`${baseDir}/medium.jpg`);

    return res.json({
      success: true,
      id: imageId,
      urls: {
        original: `/images/${imageId}/original`,
        thumb: `/images/${imageId}/thumb.jpg`,
        medium: `/images/${imageId}/medium.jpg`,
      },
    });
  } catch (error) {
    await file.cleanup?.();
    throw error;
  }
});
```

## Troubleshooting

### Upload Returns 415 Unsupported Media Type

**Cause**: Multipart parser not registered

**Solution**: Register the parser before starting the server:

```ts
import { registerStreamingMultipartParser } from '@zintrust/storage/register';

registerStreamingMultipartParser();

// Then start server
const app = Application.create();
await app.boot();

const server = Server.create(app);
await server.listen();
```

### File.path is Undefined

**Cause**: Using legacy in-memory parser or no parser registered

**Solution**: Ensure `@zintrust/storage` is installed and registered:

```bash
npm install @zintrust/storage
```

```ts
import { registerStreamingMultipartParser } from '@zintrust/storage/register';
registerStreamingMultipartParser();
```

### Temp Files Not Cleaned Up

**Cause**: Not calling `file.cleanup()`

**Solution**: Always call cleanup in a `finally` block:

```ts
const file = req.file('document');
try {
  await processFile(file);
} finally {
  await file.cleanup?.();
}
```

### Upload Fails with Large Files

**Possible Causes**:

1. `MAX_FILE_SIZE` too small
2. Proxy/load balancer timeout
3. Client timeout

**Solutions**:

1. Increase file size limit:

```bash
MAX_FILE_SIZE=104857600  # 100MB
```

2. Configure nginx timeout:

```nginx
client_max_body_size 100M;
client_body_timeout 300s;
```

3. Increase Node.js timeout:

```ts
const server = app.getHttpServer();
server.setTimeout(5 * 60 * 1000); // 5 minutes
```

### Memory Usage Still High

**Cause**: Processing files in memory instead of streaming

**Solution**: Use streams:

```ts
// ❌ BAD: Loads entire file into memory
const buffer = await fs.promises.readFile(file.path);
const processed = await processBuffer(buffer);

// ✅ GOOD: Streams file without loading into memory
await pipeline(file.stream(), transformStream, destination);
```

## Advanced: Custom Multipart Parser

You can implement a custom parser (e.g., for S3 direct upload):

```ts
import { MultipartParserRegistry, type MultipartParserProvider } from '@zintrust/core';

const customParser: MultipartParserProvider = async (input) => {
  const fields: Record<string, string | string[]> = {};
  const files: Record<string, UploadedFile[]> = {};

  // Your custom parsing logic...
  // - Stream to S3
  // - Generate presigned URLs
  // - Return UploadedFile objects with S3 paths

  return { fields, files };
};

MultipartParserRegistry.register(customParser);
```

## Performance Tips

1. **Use streams for large files** (>10MB)
2. **Clean up temp files immediately** after processing
3. **Validate MIME type and size early** to reject bad uploads quickly
4. **Implement upload progress** for better UX
5. **Use CDN or object storage** (S3, Cloudflare R2) for production
6. **Set appropriate limits** based on your use case
7. **Monitor disk usage** in temp directory
8. **Implement background processing** for heavy operations (thumbnail generation, etc.)

## Summary

- **Server layer never buffers**: Memory-safe by design
- **Middleware handles parsing**: JSON/text in `bodyParsingMiddleware`, multipart in `fileUploadMiddleware`
- **Opt-in multipart**: Install `@zintrust/storage` and register parser
- **Disk-backed uploads**: Files written to temp directory during upload
- **Always clean up**: Call `file.cleanup()` to prevent disk exhaustion
- **Validate everything**: MIME type, size, content, permissions
- **Stream large files**: Use `file.stream()` for memory efficiency
