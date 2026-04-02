type DebuggerConfigApi = {
  merge(overrides?: unknown): { enabled?: boolean; connection?: string };
};

type DebuggerStorageApi = {
  resolveStorage(db: unknown): unknown;
};

type SystemDebuggerModule = {
  DebuggerConfig: DebuggerConfigApi;
  DebuggerStorage: DebuggerStorageApi;
  registerDebuggerRoutes: (
    router: unknown,
    storage: unknown,
    options?: { basePath?: string; middleware?: ReadonlyArray<string> }
  ) => void;
};

const fallbackDebuggerConfig = Object.freeze({
  merge: (): { enabled?: boolean; connection?: string } => ({ enabled: false }),
});

const fallbackDebuggerStorage = Object.freeze({
  resolveStorage: (_db: unknown): undefined => undefined,
});

const fallbackRegisterDebuggerRoutes = (
  _router: unknown,
  _storage: unknown,
  _options?: { basePath?: string; middleware?: ReadonlyArray<string> }
): void => undefined;

const systemDebuggerModule: SystemDebuggerModule | undefined =
  await import('@zintrust/system-debugger')
    .then((module) => module as unknown as SystemDebuggerModule)
    .catch(() => undefined);

export const isAvailable = (): boolean => systemDebuggerModule !== undefined;

export const DebuggerConfig: DebuggerConfigApi =
  systemDebuggerModule?.DebuggerConfig ?? fallbackDebuggerConfig;

export const DebuggerStorage: DebuggerStorageApi =
  systemDebuggerModule?.DebuggerStorage ?? fallbackDebuggerStorage;

export const registerDebuggerRoutes =
  systemDebuggerModule?.registerDebuggerRoutes ?? fallbackRegisterDebuggerRoutes;

export const ensureSystemDebuggerRegistered = async (): Promise<void> => {
  if (!isAvailable()) return;
  await import('@zintrust/system-debugger/register').catch(() => undefined);
};
