import { Env } from '@zintrust/core/config';

export type WorkerManifestEntry = Readonly<{
  name?: string;
  workerName?: string;
  queueName?: string;
  processorSpec?: string | null;
  concurrency?: number;
  autoStart?: boolean;
  activeStatus?: boolean;
  status?: string;
}>;

type WorkersManifestGlobal = typeof globalThis & {
  workerManifestGlobalKeys?: ReadonlyArray<string>;
  __zintrustWorkerManifestGlobalKeys?: ReadonlyArray<string>;
  __zintrustWorkersManifest?: ReadonlyArray<WorkerManifestEntry>;
  __zintrustWorkerManifest?: ReadonlyArray<WorkerManifestEntry>;
  __zintrustAppWorkerManifest?: ReadonlyArray<WorkerManifestEntry>;
  [key: string]: unknown;
};

const DEFAULT_WORKER_MANIFEST_GLOBAL_KEYS = Object.freeze([
  '__zintrustWorkersManifest',
  '__zintrustWorkerManifest',
  '__zintrustAppWorkerManifest',
] as const);

const normalizeKeyList = (values: ReadonlyArray<string>): string[] => {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  );
};

const readKeyListValue = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return undefined;
  }

  return normalizeKeyList(value);
};

export const readWorkerManifestGlobalKeys = (): string[] => {
  const manifestGlobal = globalThis as WorkersManifestGlobal;

  const runtimeKeys =
    readKeyListValue(manifestGlobal.workerManifestGlobalKeys) ??
    readKeyListValue(manifestGlobal.__zintrustWorkerManifestGlobalKeys);

  if (runtimeKeys && runtimeKeys.length > 0) {
    return runtimeKeys;
  }

  const raw = Env.get('WORKER_MANIFEST_GLOBAL_KEYS', '').trim();
  if (raw.length > 0) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const jsonKeys = readKeyListValue(parsed);
      if (jsonKeys && jsonKeys.length > 0) {
        return jsonKeys;
      }
    } catch {
      // fall through to CSV parsing
    }

    const csvKeys = normalizeKeyList(
      raw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    );
    if (csvKeys.length > 0) {
      return csvKeys;
    }
  }

  return [...DEFAULT_WORKER_MANIFEST_GLOBAL_KEYS];
};

export const getWorkerManifestEntries = (): WorkerManifestEntry[] => {
  const manifestGlobal = globalThis as WorkersManifestGlobal;
  for (const key of readWorkerManifestGlobalKeys()) {
    const value = manifestGlobal[key];
    if (Array.isArray(value)) {
      return value as WorkerManifestEntry[];
    }
  }

  return [];
};

export const getWorkerManifestQueueNames = (): string[] => {
  return Array.from(
    new Set(
      getWorkerManifestEntries()
        .map((entry) => entry.queueName)
        .filter((queueName): queueName is string => typeof queueName === 'string')
        .map((queueName) => queueName.trim())
        .filter((queueName) => queueName.length > 0)
    )
  ).sort((left, right) => left.localeCompare(right));
};

export const getWorkerManifestRecord = (workerName: string): WorkerManifestEntry | undefined => {
  return getWorkerManifestEntries().find(
    (entry) => (entry.name ?? entry.workerName) === workerName
  );
};

export const getWorkerManifestStatus = (workerName: string): boolean => {
  return getWorkerManifestRecord(workerName)?.activeStatus === false;
};
