declare module '@zintrust/core' {
  export const ErrorFactory: {
    createConfigError(message: string, details?: unknown): Error;
    createTryCatchError(message: string, details?: unknown): Error;
  };
}
