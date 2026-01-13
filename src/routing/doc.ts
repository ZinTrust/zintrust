/**
 * Documentation Routes
 * Serves static files from /doc/* paths with relaxed CSP headers.
 */

import { HTTP_HEADERS } from '@config/constants';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import * as fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { MIME_TYPES_MAP, resolveSafePath, tryDecodeURIComponent } from '@routing/common';
import { ErrorRouting } from '@routing/error';
import { getPublicRoot } from '@routing/publicRoot';
import type { IRouter } from '@routing/Router';
import { Router } from '@routing/Router';

export { MIME_TYPES_MAP } from '@routing/common';

/**
 * Find the package root directory
 */
// Backward-compatible re-exports
export { findPackageRoot, getFrameworkPublicRoots, getPublicRoot } from '@routing/publicRoot';

/**
 * Map URL path to physical file path for /doc routes
 */
const mapStaticPath = (urlPath: string): string | undefined => {
  const publicRoot = getPublicRoot();
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
 * Serve a documentation static file
 * Returns true if file was served, false if not found
 */
export const serveDocumentationFile = (urlPath: string, response: IResponse): boolean => {
  let filePath = mapStaticPath(urlPath);

  if (filePath === undefined) {
    return false;
  }

  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath) && !path.extname(filePath)) {
      const htmlPath = `${filePath}.html`;
      if (fs.existsSync(htmlPath)) {
        filePath = htmlPath;
      }
    }

    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES_MAP[ext] || 'application/octet-stream';
      const content = fs.readFileSync(filePath);

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

const handleDocRequest = (req: IRequest, res: IResponse): void => {
  setDocumentationCSPHeaders(res);
  const urlPath = req.getPath();
  if (serveDocumentationFile(urlPath, res)) return;
  ErrorRouting.handleNotFound(req, res);
};

export const registerDocRoutes = (router: IRouter): void => {
  // Root docs entrypoints.
  Router.get(router, '/doc', handleDocRequest);
  Router.get(router, '/doc/', handleDocRequest);
  // Greedy path match for nested assets like /doc/assets/app.js
  Router.get(router, '/doc/:path*', handleDocRequest);
};

export default { registerDocRoutes, setDocumentationCSPHeaders, serveDocumentationFile };
