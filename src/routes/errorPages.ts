/**
 * Error Pages Static Assets
 * Serves /error-pages/* assets (CSS/JS/SVG/etc) used by HTML error templates.
 */

import { Cloudflare } from '@config/cloudflare';
import { HTTP_HEADERS, MIME_TYPES } from '@config/constants';
import { MIME_TYPES_MAP, resolveSafePath, tryDecodeURIComponent } from '@core-routes/common';
import { getFrameworkPublicRoots } from '@core-routes/publicRoot';
import type { IRouter } from '@core-routes/Router';
import { Router } from '@core-routes/Router';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import * as fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';

const getCandidatePublicRoots = (): string[] => {
  const roots = [path.join(process.cwd(), 'public'), ...getFrameworkPublicRoots()];
  const unique = new Set(roots.map((root) => root.trim()).filter((root) => root !== ''));
  return [...unique];
};

const pathExistsAsync = async (candidate: string): Promise<boolean> => {
  try {
    await fs.fsPromises.access(candidate);
    return true;
  } catch {
    return false;
  }
};

const isFileAsync = async (candidate: string): Promise<boolean> => {
  try {
    const stats = await fs.fsPromises.stat(candidate);
    return stats.isFile();
  } catch {
    return false;
  }
};

const findFirstExistingFileAsync = async (candidates: string[]): Promise<string | undefined> => {
  const results = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      isFile: await isFileAsync(candidate),
    }))
  );

  return results.find((result) => result.isFile)?.candidate;
};

const resolveErrorPageFilePathAsync = async (
  candidateRoots: string[],
  normalizedRelative: string
): Promise<string | undefined> => {
  const checks = await Promise.all(
    candidateRoots.map(async (root) => {
      const baseDir = path.join(root, 'error-pages');
      const filePath = resolveSafePath(baseDir, normalizedRelative);
      if (filePath === undefined) return undefined;

      try {
        const stats = await fs.fsPromises.stat(filePath);
        if (stats.isDirectory()) return undefined;
        return filePath;
      } catch {
        return undefined;
      }
    })
  );

  return checks.find((filePath) => typeof filePath === 'string');
};

const servePublicRootFileAsync = async (
  relativePath: string,
  response: IResponse,
  contentType: string
): Promise<boolean> => {
  const candidateRoots = getCandidatePublicRoots();
  const candidates = candidateRoots.map((root) => path.join(root, relativePath));
  const filePath = await findFirstExistingFileAsync(candidates);

  try {
    if (filePath === undefined || filePath === null) {
      response.setStatus(404);
      response.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
      response.send('Not Found');
      return false;
    }

    const content = await fs.fsPromises.readFile(filePath);
    response.setStatus(200);
    response.setHeader(HTTP_HEADERS.CONTENT_TYPE, contentType);
    response.send(content);
    return true;
  } catch (error) {
    ErrorFactory.createTryCatchError(`Error serving public file ${filePath}`, error);
    response.setStatus(500);
    response.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
    response.send('Internal Server Error');
    return false;
  }
};

const findFirstExistingFile = (candidates: string[]): string | undefined => {
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // ignore and continue
    }
  }
  return undefined;
};

const servePublicRootFile = (
  relativePath: string,
  response: IResponse,
  contentType: string
): boolean => {
  const candidateRoots = getCandidatePublicRoots();
  const candidates = candidateRoots.map((root) => path.join(root, relativePath));
  const filePath = findFirstExistingFile(candidates);

  try {
    if (filePath === undefined || filePath === null) {
      response.setStatus(404);
      response.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
      response.send('Not Found');
      return false;
    }

    const content = fs.readFileSync(filePath);
    response.setStatus(200);
    response.setHeader(HTTP_HEADERS.CONTENT_TYPE, contentType);
    response.send(content);
    return true;
  } catch (error) {
    ErrorFactory.createTryCatchError(`Error serving public file ${filePath}`, error);
    response.setStatus(500);
    response.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
    response.send('Internal Server Error');
    return false;
  }
};

const serveAssetsFileAsync = async (urlPath: string, response: IResponse): Promise<boolean> => {
  const assets = Cloudflare.getAssetsBinding();
  if (!assets) return false;

  try {
    const url = new URL(urlPath, 'https://assets.local');
    const res = await assets.fetch(url.toString());
    const contentType = res.headers.get(HTTP_HEADERS.CONTENT_TYPE) ?? MIME_TYPES.TEXT;
    const body = Buffer.from(await res.arrayBuffer());

    response.setStatus(res.status);
    response.setHeader(HTTP_HEADERS.CONTENT_TYPE, contentType);
    response.send(body);
    return true;
  } catch (error) {
    ErrorFactory.createTryCatchError(`Error serving asset ${urlPath}`, error);
    response.setStatus(500);
    response.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
    response.send('Internal Server Error');
    return true;
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

  const candidateRoots = getCandidatePublicRoots();

  const rawRelative = urlPath.slice('/error-pages/'.length);
  const normalizedRelative = tryDecodeURIComponent(rawRelative).replaceAll('\\', '/');

  for (const root of candidateRoots) {
    const baseDir = path.join(root, 'error-pages');
    const filePath = resolveSafePath(baseDir, normalizedRelative);
    if (filePath === undefined) continue;

    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        continue;
      }

      if (!fs.existsSync(filePath)) {
        continue;
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
  }

  response.setStatus(404);
  response.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
  response.send('Not Found');
  return true;
};

export const serveErrorPagesFileAsync = async (
  urlPath: string,
  response: IResponse
): Promise<boolean> => {
  if (urlPath === '/error-pages' || urlPath === '/error-pages/') {
    response.setStatus(404);
    response.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
    response.send('Not Found');
    return true;
  }

  if (!urlPath.startsWith('/error-pages/')) return false;

  if (Cloudflare.getWorkersEnv() !== null) {
    return serveAssetsFileAsync(urlPath, response);
  }

  const candidateRoots = getCandidatePublicRoots();

  const rawRelative = urlPath.slice('/error-pages/'.length);
  const normalizedRelative = tryDecodeURIComponent(rawRelative).replaceAll('\\', '/');

  const filePath = await resolveErrorPageFilePathAsync(candidateRoots, normalizedRelative);

  try {
    if (filePath !== undefined && (await pathExistsAsync(filePath))) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES_MAP[ext] || 'application/octet-stream';
      const content = await fs.fsPromises.readFile(filePath);

      response.setStatus(200);
      response.setHeader(HTTP_HEADERS.CONTENT_TYPE, contentType);
      response.send(content);
      return true;
    }
  } catch (error) {
    ErrorFactory.createTryCatchError(`Error serving error-pages file ${filePath}`, error);
    response.setStatus(500);
    response.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
    response.send('Internal Server Error');
    return true;
  }

  response.setStatus(404);
  response.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
  response.send('Not Found');
  return true;
};

const handleErrorPagesRequest = async (req: IRequest, res: IResponse): Promise<void> => {
  const urlPath = req.getPath();
  if (await serveErrorPagesFileAsync(urlPath, res)) return;

  res.setStatus(404);
  res.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
  res.send('Not Found');
};

const handleZintrustSvgRequest = async (_req: IRequest, res: IResponse): Promise<void> => {
  if (Cloudflare.getWorkersEnv() !== null) {
    await serveAssetsFileAsync('/zintrust.svg', res);
    return;
  }
  await servePublicRootFileAsync('zintrust.svg', res, MIME_TYPES.SVG);
};

export const serveZintrustSvgFile = (response: IResponse): boolean => {
  return servePublicRootFile('zintrust.svg', response, MIME_TYPES.SVG);
};

export const serveZintrustSvgFileAsync = async (response: IResponse): Promise<boolean> => {
  if (Cloudflare.getWorkersEnv() !== null) {
    return serveAssetsFileAsync('/zintrust.svg', response);
  }
  return servePublicRootFileAsync('zintrust.svg', response, MIME_TYPES.SVG);
};

export const registerErrorPagesRoutes = (router: IRouter): void => {
  Router.get(router, '/error-pages', handleErrorPagesRequest);
  Router.get(router, '/error-pages/', handleErrorPagesRequest);
  Router.get(router, '/error-pages/:path*', handleErrorPagesRequest);

  // Used by the HTML error templates (logo in footer).
  Router.get(router, '/zintrust.svg', handleZintrustSvgRequest);
};

export default { registerErrorPagesRoutes, serveErrorPagesFile };
