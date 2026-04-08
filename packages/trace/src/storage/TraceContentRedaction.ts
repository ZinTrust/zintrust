import type { ITraceEntry, ITraceStorage, RedactionConfig } from '../types';
import { redactUnknown } from '../utils/redact';

const collectRedactionFields = (redaction: RedactionConfig): string[] => {
  return [
    ...new Set([...redaction.keys, ...redaction.headers, ...redaction.body, ...redaction.query]),
  ];
};

const redactTraceEntry = (entry: ITraceEntry, redaction: RedactionConfig): ITraceEntry => {
  return {
    ...entry,
    content: redactUnknown(entry.content, collectRedactionFields(redaction)),
  };
};

const redactTracePatch = (
  patch: Partial<Pick<ITraceEntry, 'content' | 'isLatest'>>,
  redaction: RedactionConfig
): Partial<Pick<ITraceEntry, 'content' | 'isLatest'>> => {
  if (patch.content === undefined) return patch;

  return {
    ...patch,
    content: redactUnknown(patch.content, collectRedactionFields(redaction)),
  };
};

export const TraceContentRedaction = Object.freeze({
  wrapStorage(storage: ITraceStorage, redaction: RedactionConfig): ITraceStorage {
    return Object.freeze({
      ...storage,
      writeEntry: async (entry: ITraceEntry): Promise<void> => {
        await storage.writeEntry(redactTraceEntry(entry, redaction));
      },
      updateEntry: async (
        uuid: string,
        patch: Partial<Pick<ITraceEntry, 'content' | 'isLatest'>>
      ): Promise<void> => {
        await storage.updateEntry(uuid, redactTracePatch(patch, redaction));
      },
    });
  },
});
