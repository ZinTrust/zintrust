import { ErrorFactory } from '@exceptions/ZintrustError';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from '@node-singletons/http';
import type { ProxyBackend, ProxyRequest, ProxyResponse } from '@proxy/ProxyBackend';

export type ProxyServerOptions = Readonly<{
  host: string;
  port: number;
  maxBodyBytes: number;
  backend: ProxyBackend;
  verify?: (
    req: IncomingMessage,
    body: string
  ) => Promise<{ ok: true } | { ok: false; status: number; message: string }>;
}>;

const readBody = async (req: IncomingMessage, maxBodyBytes: number): Promise<string> => {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : (Buffer.from(chunk) as Buffer<ArrayBufferLike>);
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw ErrorFactory.createValidationError('Body too large');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
};

const respond = (res: ServerResponse, response: ProxyResponse): void => {
  res.writeHead(response.status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...response.headers,
  });
  res.end(JSON.stringify(response.body));
};

const toProxyRequest = (req: IncomingMessage, body: string): ProxyRequest => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key.toLowerCase()] = Array.isArray(value) ? value.join(',') : value;
  }

  return {
    method: req.method ?? 'POST',
    path: url.pathname,
    headers,
    body,
  };
};

export const createProxyServer = (
  options: ProxyServerOptions
): Readonly<{
  start: () => Promise<void>;
  stop: () => Promise<void>;
  server: Server;
}> => {
  const server: Server = createServer(async (req, res) => {
    try {
      const body = await readBody(req, options.maxBodyBytes);

      if (options.verify) {
        const verified = await options.verify(req, body);
        if (!verified.ok) {
          respond(res, {
            status: verified.status,
            body: { code: 'UNAUTHORIZED', message: verified.message },
          });
          return;
        }
      }

      if ((req.url ?? '').startsWith('/health')) {
        const response = await options.backend.health();
        respond(res, response);
        return;
      }

      const request = toProxyRequest(req, body);
      const response = await options.backend.handle(request);
      respond(res, response);
    } catch (error) {
      respond(res, {
        status: 500,
        body: { code: 'PROXY_ERROR', message: String(error) },
      });
    }
  });

  const start = async (): Promise<void> =>
    new Promise((resolve) => {
      server.listen(options.port, options.host, () => resolve());
    });

  const stop = async (): Promise<void> =>
    new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

  return Object.freeze({
    start,
    stop,
    server,
  });
};
