export type MiddlewareFailureBodyInput = Readonly<{
  reason: string;
  message: string;
}>;

export type DefaultMiddlewareFailureBody = Readonly<{
  error: Readonly<{
    code: string;
    message: string;
  }>;
}>;

export function createDefaultMiddlewareFailureBody(
  context: MiddlewareFailureBodyInput
): DefaultMiddlewareFailureBody {
  return {
    error: {
      code: context.reason,
      message: context.message,
    },
  };
}
