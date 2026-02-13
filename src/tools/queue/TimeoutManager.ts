import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';

export type TimeoutRetryConfig = {
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  operationName?: string;
};

const sleep = async (ms: number): Promise<void> => {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => {
    const timeoutRef = globalThis.setTimeout(() => {
      clearTimeout(timeoutRef);
      resolve();
    }, ms);
  });
};

const createTimeoutError = (operationName: string, timeoutMs: number): Error =>
  ErrorFactory.createTryCatchError(`Operation timed out: ${operationName}`, {
    code: 'QUEUE_TIMEOUT',
    operationName,
    timeoutMs,
  });

const isTimeoutError = (error: unknown): boolean => {
  if (error === null || error === undefined || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'QUEUE_TIMEOUT') return true;
  const details = (error as { details?: unknown }).details;
  if (details !== null && details !== undefined && typeof details === 'object') {
    return (details as { code?: unknown }).code === 'QUEUE_TIMEOUT';
  }
  return false;
};

export const TimeoutManager = Object.freeze({
  getQueueJobTimeoutMs(): number {
    const timeoutSeconds = Env.getInt('QUEUE_JOB_TIMEOUT', 60);
    return Math.max(1000, timeoutSeconds * 1000);
  },

  async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName: string,
    timeoutHandler?: () => Promise<T>
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = globalThis.setTimeout(
        () => {
          reject(createTimeoutError(operationName, timeoutMs));
        },
        Math.max(1, timeoutMs)
      );
    });

    try {
      return await Promise.race([operation(), timeoutPromise]);
    } catch (error) {
      if (timeoutHandler !== undefined && isTimeoutError(error)) {
        return await timeoutHandler();
      }
      throw error;
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  },

  async withTimeoutRetry<T>(operation: () => Promise<T>, config: TimeoutRetryConfig): Promise<T> {
    const retries = Math.max(0, Math.floor(config.maxRetries));
    const attemptRun = async (attempt: number): Promise<T> => {
      try {
        return await this.withTimeout(
          operation,
          config.timeoutMs,
          config.operationName ?? 'queue-operation'
        );
      } catch (error) {
        const shouldRetry = isTimeoutError(error) && attempt < retries;
        if (!shouldRetry) {
          throw error;
        }
        const delay = Math.max(0, Math.floor(config.retryDelayMs * 2 ** attempt));
        await sleep(delay);
        return attemptRun(attempt + 1);
      }
    };

    return attemptRun(0);
  },

  isTimeoutError,
});

export default TimeoutManager;
