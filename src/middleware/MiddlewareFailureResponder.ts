import { isObject } from '@helper/index';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';

export {
  createDefaultMiddlewareFailureBody,
  type DefaultMiddlewareFailureBody,
  type MiddlewareFailureBodyInput,
} from '@middleware/MiddlewareFailureBody';

export type MiddlewareFailureContext = Readonly<{
  middleware: string;
  reason: string;
  statusCode: number;
  message: string;
  body: unknown;
  error?: unknown;
  requestId?: string;
}>;

export type MiddlewareFailureResponder = (
  req: IRequest,
  res: IResponse,
  context: MiddlewareFailureContext
) => void | Promise<void>;

export const defaultMiddlewareFailureResponder: MiddlewareFailureResponder = (
  _req,
  res,
  context
) => {
  const statusTarget = res.setStatus(context.statusCode);
  const responseTarget = isObject(statusTarget) ? statusTarget : res;

  if (typeof responseTarget.json === 'function') {
    responseTarget.json(context.body);
    return;
  }

  if (typeof responseTarget.send === 'function') {
    responseTarget.send(JSON.stringify(context.body));
  }
};

export const respondWithMiddlewareFailure = async (
  req: IRequest,
  res: IResponse,
  responder: MiddlewareFailureResponder | undefined,
  context: MiddlewareFailureContext
): Promise<void> => {
  await (responder ?? defaultMiddlewareFailureResponder)(req, res, context);
};
