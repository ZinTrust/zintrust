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

// Static file serving for workers assets
export const registerStaticAssets = (router: IRouter, middleware: ReadonlyArray<string>): void => {
  // Resolve base path for UI assets
  const __filename = NodeSingletons.url.fileURLToPath(import.meta.url);
  const __dirname = NodeSingletons.path.dirname(__filename);
  const uiBasePath = NodeSingletons.path.resolve(__dirname, '../');

  const handler = async (_req: unknown, res: { html: (value: string) => void }): Promise<void> => {
    try {
      const html = await uiResolver(uiBasePath);
      res.html(html);
    } catch (err) {
      Logger.error('Failed to load static UI page', err);
      // Fallback to generated dashboard if static file unavailable
    }
  };

  Router.get(router, '/workers/ui', handler, { middleware });
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
      const fullPath = NodeSingletons.path.resolve(uiBasePath, filePath.replace(/^\//, ''));

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

  // Serve workers CSS and JS files
  Router.get(router, '/workers/styles.css', serveStaticFile);
  Router.get(router, '/workers/main.js', serveStaticFile);
  Router.get(router, '/workers/:filename', serveStaticFile);

  // Serve components CSS files
  Router.get(router, '/components/styles.css', serveStaticFile);
  Router.get(router, '/components/:filename', serveStaticFile);
};
