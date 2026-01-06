import { type QueueWorkRunnerResult } from '@cli/workers/QueueWorkRunner';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';

export const QueueWorkCommandUtils = Object.freeze({
  parsePositiveInt: (value: unknown, flag: string): number | undefined => {
    if (value === undefined) return undefined;
    const raw = String(value).trim();
    if (raw === '') return undefined;

    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw ErrorFactory.createCliError(
        `Error: Invalid ${flag} '${raw}'. Expected a positive integer.`
      );
    }
    return n;
  },

  parseNonNegativeInt: (value: unknown, flag: string): number | undefined => {
    if (value === undefined) return undefined;
    const raw = String(value).trim();
    if (raw === '') return undefined;

    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) {
      throw ErrorFactory.createCliError(
        `Error: Invalid ${flag} '${raw}'. Expected a non-negative integer.`
      );
    }
    return n;
  },

  normalizeDriverName: (value: unknown): string | undefined => {
    const raw = typeof value === 'string' ? value.trim() : '';
    return raw === '' ? undefined : raw;
  },

  requireQueueNameFromArgs: (args: unknown[] | undefined, helpHint: string): string => {
    const queueName = typeof args?.[0] === 'string' ? String(args[0]) : '';
    if (queueName.trim() === '') {
      throw ErrorFactory.createCliError(`Error: Missing <queueName>. Try '${helpHint}'.`);
    }
    return queueName;
  },

  logSummary: (queueName: string, kindLabel: string, result: QueueWorkRunnerResult): void => {
    Logger.info(
      `Queue work complete (${kindLabel}) for '${queueName}': processed=${result.processed} retried=${result.retried} dropped=${result.dropped} notDueRequeued=${result.notDueRequeued} unknown=${result.unknown}`
    );
  },
});

export default QueueWorkCommandUtils;
