type WorkerTraceModule = Partial<{
  emitCache: (
    operation: 'get' | 'set' | 'delete' | 'clear' | 'has',
    key: string,
    duration: number,
    hit?: boolean,
    payload?: unknown,
    store?: string,
    ttl?: number
  ) => void;
  emitEvent: (name: string, listenerCount: number, payload?: unknown) => void;
  emitQuery: (query: string, params: unknown[], duration: number, connection?: string) => void;
}>;

type GlobalTraceState = {
  __zintrust_worker_trace_bridge__?: WorkerTraceModule;
};

const getWorkerTraceModule = (): WorkerTraceModule | undefined => {
  return (globalThis as GlobalTraceState).__zintrust_worker_trace_bridge__;
};

const withWorkerTraceModule = (run: (module: WorkerTraceModule) => void): void => {
  const module = getWorkerTraceModule();
  if (module === undefined) return;

  try {
    run(module);
  } catch {
    // Ignore optional trace failures so Worker proxy behavior is unaffected.
  }
};

const emitCache = (
  operation: 'get' | 'set' | 'delete' | 'clear' | 'has',
  key: string,
  duration: number,
  hit?: boolean,
  payload?: unknown,
  store?: string,
  ttl?: number
): void => {
  withWorkerTraceModule((module) => {
    module.emitCache?.(operation, key, duration, hit, payload, store, ttl);
  });
};

const emitEvent = (name: string, listenerCount: number, payload?: unknown): void => {
  withWorkerTraceModule((module) => {
    module.emitEvent?.(name, listenerCount, payload);
  });
};

const emitQuery = (
  query: string,
  params: unknown[],
  duration: number,
  connection?: string
): void => {
  withWorkerTraceModule((module) => {
    module.emitQuery?.(query, params, duration, connection);
  });
};

export const SystemTraceWorkerBridge = Object.freeze({
  emitCache,
  emitEvent,
  emitQuery,
});

export default SystemTraceWorkerBridge;
