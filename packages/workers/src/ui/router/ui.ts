import type { IRouter } from '@zintrust/core';
import { Logger, MIME_TYPES, NodeSingletons, Router } from '@zintrust/core';

export const uiResolver = async (uiBasePath: string): Promise<string> => {
  // Resolve base path for UI assets
  // const __filename = NodeSingletons.url.fileURLToPath(import.meta.url);
  // const __dirname = NodeSingletons.path.dirname(__filename);
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

  const __filename = NodeSingletons.url.fileURLToPath(import.meta.url);
  const __dirname = NodeSingletons.path.dirname(__filename);
  uiBasePath = NodeSingletons.path.resolve(__dirname, '../');
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
