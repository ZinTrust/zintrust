import { IRequest } from '@http/Request';
import { IResponse } from '@http/Response';
import { Middleware } from '@middleware/MiddlewareStack';
import { SessionManager, type SessionManagerOptions } from '@session/SessionManager';

export type SessionOptions = SessionManagerOptions;

export const SessionMiddleware = Object.freeze({
  create(options: SessionOptions = {}): Middleware {
    const manager = SessionManager.create(options);

    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      const sessionId = await manager.ensureSessionId(req, res);

      // Keep both request state + context aligned.
      req.sessionId = sessionId;
      req.context['sessionId'] = sessionId;

      res.locals['sessionId'] = sessionId;

      await next();
    };
  },
});

export default SessionMiddleware;
