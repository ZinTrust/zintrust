/**
 * Documentation Routes
 * Serves static files from /doc/* paths with relaxed CSP headers.
 */

import { MIME_TYPES_MAP, resolveSafePath, tryDecodeURIComponent } from '@/routes/common';
import { ErrorRouting } from '@/routes/error';
import { getPublicRootAsync } from '@/routes/publicRoot';
import type { IRouter } from '@/routes/Router';
import { Router } from '@/routes/Router';
import { HTTP_HEADERS } from '@config/constants';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import * as fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';

export { MIME_TYPES_MAP } from '@/routes/common';

/**
 * Find the package root directory
 */
// Backward-compatible re-exports
export {
  findPackageRoot,
  findPackageRootAsync,
  getFrameworkPublicRoots,
  getFrameworkPublicRootsAsync,
  getPublicRoot,
  getPublicRootAsync,
} from '@/routes/publicRoot';

const mapStaticPathAsync = async (urlPath: string): Promise<string | undefined> => {
  const publicRoot = await getPublicRootAsync();
  const normalize = (p: string): string => (p.startsWith('/') ? p.slice(1) : p);

  if (urlPath === '/doc' || urlPath === '/doc/') return publicRoot;
  if (urlPath.startsWith('/doc/')) {
    const rawRelative = urlPath.slice('/doc/'.length);
    const normalizedRelative = tryDecodeURIComponent(rawRelative).replaceAll('\\', '/');
    return resolveSafePath(publicRoot, normalize(normalizedRelative));
  }

  const normalized = tryDecodeURIComponent(urlPath).replaceAll('\\', '/');
  return resolveSafePath(publicRoot, normalize(normalized));
};

/**
 * Set relaxed CSP headers for docs (allows external assets like Tailwind CDN, Google Fonts)
 */
export const setDocumentationCSPHeaders = (response: IResponse): void => {
  response.setHeader(
    HTTP_HEADERS.CONTENT_SECURITY_POLICY,
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com; " +
      "script-src-elem 'self' 'unsafe-inline' https://cdn.tailwindcss.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "img-src 'self' data: https:; " +
      "font-src 'self' data: https://fonts.gstatic.com;"
  );
};

/**
 * Serve a documentation static file (async)
 */
export const serveDocumentationFileAsync = async (
  urlPath: string,
  response: IResponse
): Promise<boolean> => {
  let filePath = await mapStaticPathAsync(urlPath);

  if (filePath === undefined) {
    return false;
  }

  try {
    try {
      const stats = await fs.fsPromises.stat(filePath);
      if (stats.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
    } catch {
      // ignore
    }

    const exists = async (p: string): Promise<boolean> => {
      try {
        await fs.fsPromises.access(p);
        return true;
      } catch {
        return false;
      }
    };

    if (!(await exists(filePath)) && !path.extname(filePath)) {
      const htmlPath = `${filePath}.html`;
      if (await exists(htmlPath)) {
        filePath = htmlPath;
      }
    }

    if (await exists(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES_MAP[ext] || 'application/octet-stream';
      const content = await fs.fsPromises.readFile(filePath);

      response.setStatus(200);
      response.setHeader('Content-Type', contentType);
      response.send(content);
      return true;
    }
  } catch (error) {
    ErrorFactory.createTryCatchError(`Error serving documentation file ${filePath}`, error);
  }

  return false;
};

const handleDocRequest = async (req: IRequest, res: IResponse): Promise<void> => {
  setDocumentationCSPHeaders(res);
  const urlPath = req.getPath();
  if (await serveDocumentationFileAsync(urlPath, res)) return;
  ErrorRouting.handleNotFound(req, res);
};

export const registerDocRoutes = (router: IRouter): void => {
  // Root docs entrypoints.
  Router.get(router, '/doc', handleDocRequest);
  Router.get(router, '/doc/', handleDocRequest);
  // Greedy path match for nested assets like /doc/assets/app.js
  Router.get(router, '/doc/:path*', handleDocRequest);
};

export default {
  registerDocRoutes,
  setDocumentationCSPHeaders,
  serveDocumentationFileAsync,
};
