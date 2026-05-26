import { ErrorFactory } from '@zintrust/core/errors';
import type { ITraceConfig, ITraceEntry, ITraceStorage } from '../types';

const appendServiceTag = (entry: ITraceEntry, serviceTag?: string): ITraceEntry => {
  const normalizedTag = serviceTag?.trim() ?? '';
  if (normalizedTag === '' || entry.tags.includes(normalizedTag)) {
    return entry;
  }

  return {
    ...entry,
    tags: [...entry.tags, normalizedTag],
  };
};

const unsupportedRead = async <T>(): Promise<T> => {
  throw ErrorFactory.createConfigError(
    'Trace proxy mode only supports runtime persistence on the sender. Query the trace server database or dashboard directly.'
  );
};

const bindOrUnsupported = <T extends (...args: never[]) => Promise<unknown>>(
  method: T | undefined
): T => {
  if (method === undefined) {
    return unsupportedRead as unknown as T;
  }

  return method;
};

export const TraceServiceTag = Object.freeze({
  wrapStorage(storage: ITraceStorage, config: ITraceConfig): ITraceStorage {
    const writeEntry = async (entry: ITraceEntry): Promise<void> => {
      await storage.writeEntry(appendServiceTag(entry, config.serviceTag));
    };

    return Object.freeze({
      writeEntry,
      updateEntry: storage.updateEntry.bind(storage),
      markFamilyStale: storage.markFamilyStale.bind(storage),
      queryEntries: bindOrUnsupported(storage.queryEntries?.bind(storage)),
      getEntry: bindOrUnsupported(storage.getEntry?.bind(storage)),
      getBatch: bindOrUnsupported(storage.getBatch?.bind(storage)),
      queryBatchEntries: bindOrUnsupported(storage.queryBatchEntries?.bind(storage)),
      prune: bindOrUnsupported(storage.prune?.bind(storage)),
      clear: bindOrUnsupported(storage.clear?.bind(storage)),
      getMonitoring: bindOrUnsupported(storage.getMonitoring?.bind(storage)),
      addMonitoring: bindOrUnsupported(storage.addMonitoring?.bind(storage)),
      removeMonitoring: bindOrUnsupported(storage.removeMonitoring?.bind(storage)),
      stats: bindOrUnsupported(storage.stats?.bind(storage)),
    });
  },
});

export default TraceServiceTag;
