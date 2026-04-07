type TraceConfigApi = {
  merge(overrides?: unknown): { enabled?: boolean; connection?: string };
};

type TraceStorageApi = {
  resolveStorage(db: unknown): unknown;
};

type SystemTraceModule = {
  TraceConfig: TraceConfigApi;
  TraceStorage: TraceStorageApi;
  registerTraceDashboard: (
    router: unknown,
    options?: { basePath?: string; middleware?: ReadonlyArray<string> }
  ) => void;
  registerTraceRoutes: (
    router: unknown,
    storage: unknown,
    options?: { basePath?: string; middleware?: ReadonlyArray<string> }
  ) => void;
};

const fallbackTraceConfig = Object.freeze({
  merge: (): { enabled?: boolean; connection?: string } => ({ enabled: false }),
});

const fallbackTraceStorage = Object.freeze({
  resolveStorage: (_db: unknown): undefined => undefined,
});

const fallbackRegisterTraceDashboard = (
  _router: unknown,
  _options?: { basePath?: string; middleware?: ReadonlyArray<string> }
): void => undefined;

const fallbackRegisterTraceRoutes = (
  _router: unknown,
  _storage: unknown,
  _options?: { basePath?: string; middleware?: ReadonlyArray<string> }
): void => undefined;

const systemTraceModule: SystemTraceModule | undefined = await import('@zintrust/trace')
  .then((module) => module as unknown as SystemTraceModule)
  .catch(() => undefined);

export const isAvailable = (): boolean => systemTraceModule !== undefined;

export const TraceConfig: TraceConfigApi = systemTraceModule?.TraceConfig ?? fallbackTraceConfig;

export const TraceStorage: TraceStorageApi =
  systemTraceModule?.TraceStorage ?? fallbackTraceStorage;

export const registerTraceDashboard =
  systemTraceModule?.registerTraceDashboard ?? fallbackRegisterTraceDashboard;

export const registerTraceRoutes =
  systemTraceModule?.registerTraceRoutes ?? fallbackRegisterTraceRoutes;

export const ensureSystemTraceRegistered = async (): Promise<void> => {
  if (!isAvailable()) return;
  await import('@zintrust/trace/register').catch(() => undefined);
};
