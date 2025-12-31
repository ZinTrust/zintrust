import { HTTP_HEADERS } from '@zintrust/core';
import { Env } from '@zintrust/core';
import { type IRouter, Router } from '@zintrust/core';
import { LocalSignedUrl } from '@zintrust/core';
import { Storage } from '@zintrust/core';

export function registerStorageRoutes(router: IRouter): void {
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
