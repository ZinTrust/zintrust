type NodeProcessWithDebugHandles = typeof process & {
  _getActiveHandles?: () => unknown[];
  _getActiveRequests?: () => unknown[];
};

type ShutdownTraceDetails = Record<string, unknown>;

const TRACE_ENV_KEYS = ['SHUTDOWN_TRACE', 'DEBUG_SHUTDOWN_TRACE', 'WORKER_SHUTDOWN_TRACE'];
const MAX_HANDLE_DETAILS = 20;

const writeLine = (line: string): void => {
  const nodeProcess = getNodeProcess();
  if (nodeProcess?.stderr && typeof nodeProcess.stderr.write === 'function') {
    nodeProcess.stderr.write(`${line}\n`);
  }
};

const getNodeProcess = (): NodeProcessWithDebugHandles | null => {
  if (typeof process === 'undefined') return null;
  return process as NodeProcessWithDebugHandles;
};

const isEnabled = (): boolean => {
  const nodeProcess = getNodeProcess();
  if (nodeProcess === null) return false;

  return TRACE_ENV_KEYS.some((key) => {
    const raw = nodeProcess.env[key];
    if (typeof raw !== 'string') return false;

    const normalized = raw.trim().toLowerCase();
    return (
      normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
    );
  });
};

const getConstructorName = (value: unknown): string => {
  if (typeof value !== 'object' || value === null) return typeof value;
  const constructorValue = (value as { constructor?: { name?: unknown } }).constructor;
  return typeof constructorValue?.name === 'string' ? constructorValue.name : 'Unknown';
};

const hasFunction = <T extends string>(
  value: unknown,
  key: T
): value is Record<T, (...args: unknown[]) => unknown> => {
  return (
    typeof value === 'object' &&
    value !== null &&
    key in value &&
    typeof (value as Record<T, unknown>)[key] === 'function'
  );
};

const getOptionalValue = (value: unknown, key: string): unknown => {
  if (typeof value !== 'object' || value === null || !(key in value)) return undefined;
  return (value as Record<string, unknown>)[key];
};

const summarizeHandle = (handle: unknown): ShutdownTraceDetails => {
  const constructorName = getConstructorName(handle);
  const summary: ShutdownTraceDetails = {
    type: constructorName,
  };

  const fd = getOptionalValue(handle, 'fd');
  if (typeof fd === 'number') {
    summary['fd'] = fd;
  }

  const localPort = getOptionalValue(handle, 'localPort');
  if (typeof localPort === 'number') {
    summary['localPort'] = localPort;
  }

  const remotePort = getOptionalValue(handle, 'remotePort');
  if (typeof remotePort === 'number') {
    summary['remotePort'] = remotePort;
  }

  const repeat = getOptionalValue(handle, '_repeat');
  if (typeof repeat === 'number') {
    summary['repeatMs'] = repeat;
  }

  const destroyed = getOptionalValue(handle, 'destroyed');
  if (typeof destroyed === 'boolean') {
    summary['destroyed'] = destroyed;
  }

  if (hasFunction(handle, 'hasRef')) {
    try {
      summary['hasRef'] = handle.hasRef();
    } catch {
      summary['hasRef'] = 'error';
    }
  }

  return summary;
};

const countTypes = (items: unknown[]): Record<string, number> => {
  return items.reduce<Record<string, number>>((counts, item) => {
    const type = getConstructorName(item);
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
};

const log = (label: string, details: ShutdownTraceDetails = {}): void => {
  if (!isEnabled()) return;
  writeLine(
    JSON.stringify({
      level: 'info',
      trace: 'shutdown',
      label,
      details,
    })
  );
};

const logHandles = (label: string, details: ShutdownTraceDetails = {}): void => {
  if (!isEnabled()) return;

  const nodeProcess = getNodeProcess();
  if (nodeProcess === null) {
    writeLine(
      JSON.stringify({
        level: 'info',
        trace: 'shutdown',
        label,
        details: {
          ...details,
          available: false,
          reason: 'process unavailable',
        },
      })
    );
    return;
  }

  const handles =
    typeof nodeProcess._getActiveHandles === 'function' ? nodeProcess._getActiveHandles() : [];
  const requests =
    typeof nodeProcess._getActiveRequests === 'function' ? nodeProcess._getActiveRequests() : [];

  writeLine(
    JSON.stringify({
      level: 'info',
      trace: 'shutdown',
      label,
      details: {
        ...details,
        available: true,
        handleCount: handles.length,
        requestCount: requests.length,
        handleTypes: countTypes(handles),
        requestTypes: countTypes(requests),
        handles: handles.slice(0, MAX_HANDLE_DETAILS).map((handle) => summarizeHandle(handle)),
        requests: requests.slice(0, MAX_HANDLE_DETAILS).map((request) => summarizeHandle(request)),
      },
    })
  );
};

const logBullMQWorker = (
  label: string,
  worker: unknown,
  details: ShutdownTraceDetails = {}
): void => {
  if (!isEnabled()) return;

  const name = getOptionalValue(worker, 'name');
  const opts = getOptionalValue(worker, 'opts');
  const connection = getOptionalValue(opts, 'connection');
  const prefix = getOptionalValue(opts, 'prefix');
  const concurrency = getOptionalValue(opts, 'concurrency');
  const autorun = getOptionalValue(opts, 'autorun');
  const closing = getOptionalValue(worker, 'closing');

  writeLine(
    JSON.stringify({
      level: 'info',
      trace: 'shutdown',
      label,
      details: {
        ...details,
        workerType: getConstructorName(worker),
        queueName: typeof name === 'string' ? name : undefined,
        prefix: typeof prefix === 'string' ? prefix : undefined,
        concurrency: typeof concurrency === 'number' ? concurrency : undefined,
        autorun: typeof autorun === 'boolean' ? autorun : undefined,
        connectionType: getConstructorName(connection),
        closingState: closing === undefined ? 'idle' : getConstructorName(closing),
      },
    })
  );
};

export const ShutdownTrace = Object.freeze({
  isEnabled,
  log,
  logHandles,
  logBullMQWorker,
});
