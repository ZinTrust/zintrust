import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const args = new Map();
  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const nextToken = argv[i + 1];

      if (nextToken && !nextToken.startsWith('--')) {
        args.set(key, nextToken);
        i += 2;
      } else {
        args.set(key, 'true');
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  return args;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
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
    return stat.isDirectory() ? path.join(normalized, 'index.html') : normalized;
  } catch {
    // Try adding .html extension
    try {
      const htmlPath = `${normalized}.html`;
      await fs.stat(htmlPath);
      return htmlPath;
    } catch {
      // Fallback to index.html for root
      return pathnameNoLeadingSlash === '' ? path.join(rootDir, 'index.html') : null;
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

async function handleRequest(req, res) {
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

  return serveFile(res, filePath, method);
}

const server = http.createServer(handleRequest);

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Docs portal dev server: http://${host}:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Serving: ${rootDir}`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
