import { Logger } from '@config/logger';
import { isObject } from '@helper/index';

export type StartupErrorDetails = Readonly<{
  errors?: unknown;
  warnings?: unknown;
  report?: unknown;
}>;

export type StartupErrorLogMessages = Readonly<{
  errors: string;
  warnings: string;
  report: string;
}>;

const extractDetails = (error: unknown): StartupErrorDetails | undefined => {
  if (!isObject(error)) return undefined;

  const details = error['details'];
  if (!isObject(details)) return undefined;

  return details;
};

const logDetails = (error: unknown, messages: StartupErrorLogMessages): void => {
  try {
    const details = extractDetails(error);
    if (details === undefined) return;

    if (details.errors !== undefined) {
      Logger.error(messages.errors, details.errors);
    }
    if (details.warnings !== undefined) {
      Logger.warn(messages.warnings, details.warnings);
    }
    if (details.report !== undefined) {
      Logger.error(messages.report, details.report);
    }
  } catch {
    // Best-effort diagnostics only.
  }
};

export const StartupErrorLogging = Object.freeze({
  extractDetails,
  logDetails,
});

export default StartupErrorLogging;
