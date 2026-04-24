import {
  Env,
  HTTP_HEADERS,
  LocalSignedUrl,
  Storage,
  type IRouter,
  Router,
} from '@zintrust/core';

export function registerStorageRoutes(router: IRouter): void {
  // Public file serving: /storage/<path>
  Router.get(router, '/storage/:path*', async (req, res) => {
    const raw = req.getParam('path') ?? '';
    const key = typeof raw === 'string' ? decodeURIComponent(raw).replaceAll('\\\u005C', '/') : '';

    if (key.trim() === '') {
      res.setStatus(400).json({ message: 'Missing path' });
      return;
    }

    // Respect private folder convention: do not expose keys under `private/`
    if (key.startsWith('private/') || key === 'private') {
      res.setStatus(404).json({ message: 'Not Found' });
      return;
    }

    try {
      const contents = await Storage.get('local', key);
      res.setHeader(HTTP_HEADERS.CONTENT_TYPE, 'application/octet-stream');
      res.setStatus(200).send(contents);
    } catch {
      res.setStatus(404).json({ message: 'Not Found' });
    }
  });

  Router.get(router, '/storage/download', async (req, res) => {
    const tokenRaw = req.getQueryParam('token');
    const token = typeof tokenRaw === 'string' ? tokenRaw : '';

    if (token.trim() === '') {
      res.setStatus(400).json({ message: 'Missing token' });
      return;
    }

    const appKey = Env.get('APP_KEY', '');
    if (appKey.trim() === '') {
      res.setStatus(500).json({ message: 'Storage signing is not configured' });
      return;
    }

    try {
      const payload = LocalSignedUrl.verifyToken(token, appKey);

      // Only local disk is supported by this route.
      if (payload.disk !== 'local') {
        res.setStatus(400).json({ message: 'Unsupported disk' });
        return;
      }

      const contents = await Storage.get('local', payload.key);

      res.setHeader(HTTP_HEADERS.CONTENT_TYPE, 'application/octet-stream');
      res.setStatus(200).send(contents);
    } catch {
      res.setStatus(403).json({ message: 'Invalid or expired token' });
    }
  });
}

export default registerStorageRoutes;
