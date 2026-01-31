/**
 * Server - HTTP Server implementation
 * Uses Node.js built-in HTTP server with no external dependencies
 */

import type { IApplication } from '@boot/Application';
import { appConfig } from '@config/app';
import { HTTP_HEADERS } from '@config/constants';
import { Logger } from '@config/logger';
import { ServiceContainer, type IServiceContainer } from '@container/ServiceContainer';
import { ErrorRouting } from '@core-routes/error';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IKernel } from '@http/Kernel';
import { Kernel } from '@http/Kernel';
import type { IRequest } from '@http/Request';
import { Request } from '@http/Request';
import type { IResponse } from '@http/Response';
import { Response } from '@http/Response';
import * as http from '@node-singletons/http';
import type { Socket } from '@node-singletons/net';

export interface IServer {
  listen(): Promise<void>;
  close(): Promise<void>;
  getHttpServer(): http.Server;
}

/**
 * Set security headers on response
 */
const getContentSecurityPolicyForPath = (): string => {
  // Default CSP for the API/framework
  return (
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "img-src 'self' data:; " +
    "font-src 'self' https://fonts.gstatic.com;"
  );
};

const setSecurityHeaders = (res: http.ServerResponse, contentType?: string): void => {
  res.setHeader(HTTP_HEADERS.X_POWERED_BY, 'ZinTrust');
  res.setHeader(HTTP_HEADERS.X_CONTENT_TYPE_OPTIONS, 'nosniff');
  res.setHeader(HTTP_HEADERS.X_FRAME_OPTIONS, 'DENY');
  res.setHeader(HTTP_HEADERS.X_XSS_PROTECTION, '1; mode=block');
  res.setHeader(HTTP_HEADERS.REFERRER_POLICY, 'strict-origin-when-cross-origin');

  // Only apply CSP to HTML responses, not API endpoints
  // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
  if (contentType !== undefined && contentType !== null && contentType.includes('text/html')) {
    res.setHeader(HTTP_HEADERS.CONTENT_SECURITY_POLICY, getContentSecurityPolicyForPath());
  }
};

const handleRequest = async (
  params: { getKernel: () => IKernel },
  req: http.IncomingMessage | null,
  res: http.ServerResponse
): Promise<void> => {
  let request: IRequest | undefined;
  let response: IResponse | undefined;

  try {
    const contentType = req?.headers['content-type'];
    setSecurityHeaders(res, contentType);

    if (!req) {
      throw ErrorFactory.createConnectionError('Request object is missing');
    }

    const kernel = params.getKernel();
    request = Request.create(req);
    response = Response.create(res);

    // Delegate request lifecycle to Kernel (routing + middleware + handler execution).
    await kernel.handleRequest(request, response);
  } catch (error) {
    ErrorFactory.createTryCatchError('Server error:', error);

    // Prefer wrapper-based error handling when available.
    if (request !== undefined && response !== undefined) {
      ErrorRouting.handleInternalServerErrorWithWrappers(request, response, error);
      return;
    }

    ErrorRouting.handleInternalServerErrorRaw(res);
  }
};

/**
 * Server - HTTP Server implementation
 * Refactored to Functional Object pattern
 */
export const Server = Object.freeze({
  /**
   * Create a new server instance
   */
  create(app: IApplication, port?: number, host?: string, kernel: IKernel | null = null): IServer {
    const serverPort = port ?? appConfig.port;
    const serverHost = host ?? appConfig.host;

    let kernelInstance: IKernel | null = kernel;

    const getKernel = (): IKernel => {
      if (kernelInstance !== null) return kernelInstance;

      const anyApp = app as unknown as { getContainer?: () => unknown };
      const container: IServiceContainer =
        typeof anyApp.getContainer === 'function'
          ? (anyApp.getContainer() as IServiceContainer)
          : ServiceContainer.create();

      kernelInstance = Kernel.create(app.getRouter(), container);
      return kernelInstance;
    };

    const httpServer = http.createServer(
      async (req: http.IncomingMessage, res: http.ServerResponse) =>
        handleRequest({ getKernel }, req, res)
    );

    const sockets = new Set<Socket>();
    httpServer.on('connection', (socket: Socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });

    return {
      async listen(): Promise<void> {
        return new Promise((resolve) => {
          httpServer.listen(serverPort, serverHost, () => {
            resolve();
          });
        });
      },
      async close(): Promise<void> {
        return new Promise((resolve) => {
          httpServer.close(() => {
            Logger.info('ZinTrust server stopped');
            resolve();
          });

          // Ensure keep-alive / hanging connections don't block shutdown
          for (const socket of sockets) {
            try {
              socket.destroy();
            } catch {
              // best-effort
            }
          }
        });
      },
      getHttpServer(): http.Server {
        return httpServer;
      },
    };
  },
});

export default Server;
