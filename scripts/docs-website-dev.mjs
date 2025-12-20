import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const args = new Map();
  argv.forEach((token, index) => {
    if (!token.startsWith('--')) return;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value && !value.startsWith('--')) {
      args.set(key, value);
    } else {
      args.set(key, 'true');
    }
  });
  return args;
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.mjs':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.ico':
      return 'image/x-icon';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.map':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function safeDecodePathname(url) {
  try {
    return decodeURIComponent(url);
  } catch {
    return null;
  }
}

async function resolveFilePath(normalized, pathnameNoLeadingSlash, rootDir) {
  try {
    const stat = await fs.stat(normalized);
    if (stat.isDirectory()) {
      return path.join(normalized, 'index.html');
    }
    return normalized;
  } catch {
    try {
      const htmlPath = `${normalized}.html`;
      await fs.stat(htmlPath);
      return htmlPath;
    } catch {
      if (pathnameNoLeadingSlash === '') {
        return path.join(rootDir, 'index.html');
      }
      return null;
    }
  }
}

async function serveError(res, rootDir, statusCode, message) {
  if (statusCode === 404) {
    try {
      const errorPage = path.join(rootDir, '404.html');
      const data = await fs.readFile(errorPage);
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      res.end(data);
      return;
    } catch {
      // Fallback to plain text
    }
  }
  res.writeHead(statusCode, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(message);
}

async function serveFile(res, filePath, method) {
  try {
    const data = await fs.readFile(filePath);
    const headers = {
      'content-type': getMimeType(filePath),
      'cache-control': 'no-cache',
      'X-Powered-By': 'ZinTrust',
    };

    res.writeHead(200, headers);
    if (method === 'HEAD') {
      res.end();
      return;
    }

    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

const args = parseArgs(process.argv.slice(2));
const port = Number(args.get('port') ?? process.env.DOCS_PORT ?? 7030);
const host = String(args.get('host') ?? process.env.DOCS_HOST ?? '127.0.0.1');

const thisFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(thisFile), '..', 'docs-website', 'public');

const server = http.createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    return serveError(res, rootDir, 405, 'Method Not Allowed');
  }

  const requestUrl = req.url ?? '/';
  const [rawPathname] = requestUrl.split('?');
  const decodedPathname = safeDecodePathname(rawPathname);
  if (decodedPathname === null) {
    return serveError(res, rootDir, 400, 'Bad Request');
  }

  const pathnameNoLeadingSlash = decodedPathname.replace(/^\/+/, '');
  const joined = path.join(rootDir, pathnameNoLeadingSlash);
  const normalized = path.normalize(joined);

  if (!normalized.startsWith(rootDir)) {
    return serveError(res, rootDir, 403, 'Forbidden');
  }

  const filePath = await resolveFilePath(normalized, pathnameNoLeadingSlash, rootDir);

  if (!filePath) {
    return serveError(res, rootDir, 404, 'Not Found');
  }

  await serveFile(res, filePath, method);
});

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Docs portal dev server: http://${host}:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Serving: ${rootDir}`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
