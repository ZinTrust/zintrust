import type { AssetsBinding, IRouter } from '@zintrust/core';
import {
  Cloudflare,
  Logger,
  MIME_TYPES,
  NodeSingletons,
  Router,
  detectRuntime,
} from '@zintrust/core';

const isCloudflare = detectRuntime().isCloudflare;

const safeFileUrlToPath = (url: string | undefined): string => {
  if (typeof url !== 'string' || url.trim() === '') return '';
  try {
    return NodeSingletons.url.fileURLToPath(url);
  } catch {
    return '';
  }
};

const safeCwd = (): string => {
  try {
    const cwd = NodeSingletons.process?.cwd?.();
    if (typeof cwd === 'string' && cwd.trim() !== '') return cwd;
  } catch {
    // ignore
  }
  return '';
};

const getAssetsBinding = (): AssetsBinding | null => Cloudflare.getAssetsBinding();

const fetchAssetText = async (assetPath: string): Promise<string> => {
  const assets = getAssetsBinding();
  if (!assets) return '';
  const url = new URL(assetPath, 'http://assets');
  const response = await assets.fetch(url);
  if (!response.ok) return '';
  return response.text();
};

const fetchAssetBytes = async (assetPath: string): Promise<Uint8Array | null> => {
  const assets = getAssetsBinding();
  if (!assets) return null;
  const url = new URL(assetPath, 'http://assets');
  const response = await assets.fetch(url);
  if (!response.ok) return null;
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
};

export const uiResolver = async (uiBasePath: string): Promise<string> => {
  // Resolve base path for UI assets
  // const __filename = NodeSingletons.url.fileURLToPath(import.meta.url);
  // const __dirname = NodeSingletons.path.dirname(__filename);
  const assetHtml = await fetchAssetText('/workers/index.html');
  if (assetHtml !== '') return assetHtml;

  if (isCloudflare) return '';

  const uiPath = NodeSingletons.path.resolve(uiBasePath, 'workers/index.html');
  const html = await NodeSingletons.fs.readFile(uiPath, 'utf8');

  return html;
};

// MIME type mapping for static files
const getMimeType = (filePath: string): string => {
  const ext = NodeSingletons.path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.css': MIME_TYPES.CSS,
    '.js': MIME_TYPES.JS,
    '.html': MIME_TYPES.HTML,
    '.json': MIME_TYPES.JSON,
    '.png': MIME_TYPES.PNG,
    '.jpg': MIME_TYPES.JPG,
    '.jpeg': MIME_TYPES.JPG,
    '.gif': MIME_TYPES.GIF,
    '.svg': MIME_TYPES.SVG,
    '.ico': MIME_TYPES.ICO,
    '.ipa': MIME_TYPES.IPA,
  };
  return mimeTypes[ext] || MIME_TYPES.IPA;
};

let uiBasePath = '';
const getUiBase = (): string => {
  // Resolve base path for UI assets
  if (uiBasePath.length > 0) return uiBasePath;

  const __filename = safeFileUrlToPath(import.meta.url);
  if (__filename !== '') {
    const __dirname = NodeSingletons.path.dirname(__filename);
    uiBasePath = NodeSingletons.path.resolve(__dirname, '../');
    return uiBasePath;
  }

  const cwd = safeCwd();
  if (cwd !== '') {
    uiBasePath = NodeSingletons.path.resolve(cwd, 'packages', 'workers', 'src', 'ui');
    return uiBasePath;
  }

  uiBasePath = '';
  return uiBasePath;
};
const serveStaticFile = async (
  req: { getPath: () => string },
  res: {
    setHeader: (name: string, value: string) => void;
    send: (data: Buffer) => void;
    setStatus: (code: number) => void;
  }
): Promise<void> => {
  try {
    const filePath = req.getPath();
    const assetBytes = await fetchAssetBytes(filePath);
    if (assetBytes) {
      const mimeType = getMimeType(filePath);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache
      res.send(Buffer.from(assetBytes));
      return;
    }

    if (isCloudflare) {
      res.setStatus(404);
      res.send(Buffer.from('Not Found'));
      return;
    }

    const fullPath = NodeSingletons.path.resolve(getUiBase(), filePath.replace(/^\//, ''));

    // Security check - prevent directory traversal
    if (!fullPath.startsWith(uiBasePath)) {
      res.setStatus(403);
      res.send(Buffer.from('Forbidden'));
      return;
    }

    const content = await NodeSingletons.fs.readFile(fullPath);
    const mimeType = getMimeType(filePath);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache
    res.send(content);
  } catch (err) {
    Logger.warn(`Static file not found: ${req.getPath()}`, err);
    res.setStatus(404);
    res.send(Buffer.from('Not Found'));
  }
};

// Static file serving for workers assets
export const registerStaticAssets = (router: IRouter, middleware: ReadonlyArray<string>): void => {
  const handler = async (_req: unknown, res: { html: (value: string) => void }): Promise<void> => {
    try {
      const html = await uiResolver(getUiBase());
      res.html(html);
    } catch (err) {
      Logger.error('Failed to load static UI page', err);
      // Fallback to generated dashboard if static file unavailable
    }
  };

  Router.group(router, '/workers', (r: IRouter) => {
    Router.get(r, '/', handler, { middleware });
    // Serve workers CSS and JS files
    Router.get(r, '/styles.css', serveStaticFile);
    Router.get(r, '/main.js', serveStaticFile);
    Router.get(r, '/:filename', serveStaticFile);
    Router.get(r, '/integration/:filename', serveStaticFile);

    // Serve components CSS files
    Router.get(r, '/components/styles.css', serveStaticFile);
    Router.get(r, '/components/:filename', serveStaticFile);
  });
};
