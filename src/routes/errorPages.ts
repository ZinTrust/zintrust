/**
 * Error Pages Static Assets
 * Serves /error-pages/* assets (CSS/JS/SVG/etc) used by HTML error templates.
 */

import { MIME_TYPES_MAP, resolveSafePath, tryDecodeURIComponent } from '@/routes/common';
import { getPublicRoot } from '@/routes/publicRoot';
import type { IRouter } from '@/routes/Router';
import { Router } from '@/routes/Router';
import { HTTP_HEADERS, MIME_TYPES } from '@config/constants';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import * as fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';

const servePublicRootFile = (
  relativePath: string,
  response: IResponse,
  contentType: string
): void => {
  const publicRoot = getPublicRoot();
  const filePath = path.join(publicRoot, relativePath);

  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.setStatus(404);
      response.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
      response.send('Not Found');
      return;
    }

    const content = fs.readFileSync(filePath);
    response.setStatus(200);
    response.setHeader(HTTP_HEADERS.CONTENT_TYPE, contentType);
    response.send(content);
    return;
  } catch (error) {
    ErrorFactory.createTryCatchError(`Error serving public file ${filePath}`, error);
    response.setStatus(500);
    response.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
    response.send('Internal Server Error');
    return;
  }
};

export const serveErrorPagesFile = (urlPath: string, response: IResponse): boolean => {
  if (urlPath === '/error-pages' || urlPath === '/error-pages/') {
    response.setStatus(404);
    response.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
    response.send('Not Found');
    return true;
  }

  if (!urlPath.startsWith('/error-pages/')) return false;

  const publicRoot = getPublicRoot();
  const baseDir = path.join(publicRoot, 'error-pages');

  const rawRelative = urlPath.slice('/error-pages/'.length);
  const normalizedRelative = tryDecodeURIComponent(rawRelative).replaceAll('\\', '/');

  const filePath = resolveSafePath(baseDir, normalizedRelative);
  if (filePath === undefined) {
    response.setStatus(404);
    response.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
    response.send('Not Found');
    return true;
  }

  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      response.setStatus(404);
      response.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
      response.send('Not Found');
      return true;
    }

    if (!fs.existsSync(filePath)) {
      response.setStatus(404);
      response.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
      response.send('Not Found');
      return true;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES_MAP[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);

    response.setStatus(200);
    response.setHeader(HTTP_HEADERS.CONTENT_TYPE, contentType);
    response.send(content);
    return true;
  } catch (error) {
    ErrorFactory.createTryCatchError(`Error serving error-pages file ${filePath}`, error);
    response.setStatus(500);
    response.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
    response.send('Internal Server Error');
    return true;
  }
};

const handleErrorPagesRequest = (req: IRequest, res: IResponse): void => {
  const urlPath = req.getPath();
  if (serveErrorPagesFile(urlPath, res)) return;

  res.setStatus(404);
  res.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
  res.send('Not Found');
};

const handleZintrustSvgRequest = (_req: IRequest, res: IResponse): void => {
  servePublicRootFile('zintrust.svg', res, MIME_TYPES.SVG);
};

export const registerErrorPagesRoutes = (router: IRouter): void => {
  Router.get(router, '/error-pages', handleErrorPagesRequest);
  Router.get(router, '/error-pages/', handleErrorPagesRequest);
  Router.get(router, '/error-pages/:path*', handleErrorPagesRequest);

  // Used by the HTML error templates (logo in footer).
  Router.get(router, '/zintrust.svg', handleZintrustSvgRequest);
};

export default { registerErrorPagesRoutes, serveErrorPagesFile };
