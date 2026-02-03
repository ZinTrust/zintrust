export type ProxyErrorResponse = Readonly<{
  status: number;
  body: { code: string; message: string };
}>;

const toProxyError = (status: number, code: string, message: string): ProxyErrorResponse => ({
  status,
  body: { code, message },
});

export const ErrorHandler = Object.freeze({
  toProxyError,
});
