type TraceConfigApi = {
  merge(overrides?: unknown): { enabled?: boolean; connection?: string };
};

type TraceStorageApi = {
  resolveStorage(db: unknown): unknown;
};

type SystemTraceModule = {
  TraceConfig: TraceConfigApi;
  TraceStorage: TraceStorageApi;
  captureTraceException?: (
    error: unknown,
    context?: {
      batchId?: string;
      hostname?: string;
      path?: string;
      userId?: string;
    }
  ) => void;
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

const fallbackCaptureTraceException = (
  _error: unknown,
  _context?: { batchId?: string; hostname?: string; path?: string; userId?: string }
): void => undefined;

let systemTraceModule: SystemTraceModule | undefined;
let didAttemptSystemTraceLoad = false;
let pendingSystemTraceLoad: Promise<SystemTraceModule | undefined> | undefined;

const loadSystemTraceModule = async (): Promise<SystemTraceModule | undefined> => {
  if (systemTraceModule !== undefined) return systemTraceModule;
  if (didAttemptSystemTraceLoad && pendingSystemTraceLoad === undefined) return undefined;
  if (pendingSystemTraceLoad !== undefined) return pendingSystemTraceLoad;

  pendingSystemTraceLoad = import('@zintrust/trace')
    .then((module) => {
      systemTraceModule = module as unknown as SystemTraceModule;
      return systemTraceModule;
    })
    .catch(() => undefined)
    .finally(() => {
      didAttemptSystemTraceLoad = true;
      pendingSystemTraceLoad = undefined;
    });

  return pendingSystemTraceLoad;
};

export const isAvailable = (): boolean => systemTraceModule !== undefined;

export const TraceConfig: TraceConfigApi = Object.freeze({
  merge(overrides?: unknown): { enabled?: boolean; connection?: string } {
    return (systemTraceModule?.TraceConfig ?? fallbackTraceConfig).merge(overrides);
  },
});

export const TraceStorage: TraceStorageApi = Object.freeze({
  resolveStorage(db: unknown): unknown {
    return (systemTraceModule?.TraceStorage ?? fallbackTraceStorage).resolveStorage(db);
  },
});

export const registerTraceDashboard = (
  router: unknown,
  options?: { basePath?: string; middleware?: ReadonlyArray<string> }
): void => {
  (systemTraceModule?.registerTraceDashboard ?? fallbackRegisterTraceDashboard)(router, options);
};

export const registerTraceRoutes = (
  router: unknown,
  storage: unknown,
  options?: { basePath?: string; middleware?: ReadonlyArray<string> }
): void => {
  (systemTraceModule?.registerTraceRoutes ?? fallbackRegisterTraceRoutes)(router, storage, options);
};

export const captureTraceException = (
  error: unknown,
  context?: { batchId?: string; hostname?: string; path?: string; userId?: string }
): void => {
  if (systemTraceModule?.captureTraceException !== undefined) {
    systemTraceModule.captureTraceException(error, context);
    return;
  }

  void loadSystemTraceModule().then((module) => {
    (module?.captureTraceException ?? fallbackCaptureTraceException)(error, context);
  });
};

export const ensureSystemTraceRegistered = async (): Promise<void> => {
  const module = await loadSystemTraceModule();
  if (module === undefined) return;
  await import('@zintrust/trace/register').catch(() => undefined);
};
