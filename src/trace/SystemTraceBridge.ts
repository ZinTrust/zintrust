type SystemTraceModule = Partial<{
  CacheWatcher: {
    emit: (
      operation: 'get' | 'set' | 'delete' | 'clear' | 'has',
      key: string,
      duration: number,
      hit?: boolean,
      payload?: unknown,
      store?: string,
      ttl?: number
    ) => void;
  };
  JobWatcher: {
    onDispatch: (name: string, queue: string, connection: string, data?: unknown) => void;
    onProcessed: (name: string) => void;
    onFailed: (name: string, error: Error) => void;
  };
  NotificationWatcher: {
    emit: (
      notification: string,
      channels: string[],
      notifiable?: string,
      message?: string,
      payload?: unknown
    ) => void;
  };
  MailWatcher: {
    emit: (to: string, subject: string, template?: string, text?: string, html?: string) => void;
  };
  HttpClientWatcher: {
    emit: (payload: {
      method: string;
      url: string;
      requestHeaders: Record<string, string>;
      responseStatus?: number;
      duration: number;
      requestBody?: unknown;
      responseHeaders?: Record<string, string>;
      responseBody?: unknown;
      error?: string;
    }) => void;
  };
  QueryWatcher: {
    emit: (query: string, params: unknown[], duration: number, connection?: string) => void;
  };
  RedisWatcher: {
    emit: (command: string, duration: number) => void;
  };
  EventWatcher: {
    emit: (name: string, listenerCount: number, payload?: unknown) => void;
  };
  AuthWatcher: {
    emit: (event: 'login' | 'logout' | 'failed', userId?: string) => void;
  };
  CommandWatcher: {
    emit: (
      name: string,
      args: Record<string, unknown>,
      exitCode: number,
      duration: number,
      output?: string
    ) => void;
  };
}>;

let cachedModule: SystemTraceModule | null | undefined;
let loadPromise: Promise<SystemTraceModule | null> | null = null;

const importSystemTrace = async (): Promise<SystemTraceModule | null> => {
  try {
    return (await import('@zintrust/trace')) as unknown as SystemTraceModule;
  } catch {
    return null;
  }
};

const loadSystemTrace = async (): Promise<SystemTraceModule | null> => {
  if (cachedModule !== undefined) return cachedModule;
  if (loadPromise !== null) return loadPromise;

  loadPromise = importSystemTrace().then((loaded) => {
    cachedModule = loaded;
    loadPromise = null;
    return loaded;
  });

  return loadPromise;
};

const withSystemTrace = (run: (module: SystemTraceModule) => void): void => {
  const invoke = (module: SystemTraceModule | null | undefined): void => {
    if (module === null || module === undefined) return;

    try {
      run(module);
    } catch {
      // Ignore optional trace failures so core runtime behavior is unaffected.
    }
  };

  if (cachedModule !== undefined) {
    invoke(cachedModule);
    return;
  }

  void loadSystemTrace()
    .then(invoke)
    .catch(() => undefined);
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
  withSystemTrace((module) => {
    module.CacheWatcher?.emit(operation, key, duration, hit, payload, store, ttl);
  });
};

const emitJobDispatch = (name: string, queue: string, connection: string, data?: unknown): void => {
  withSystemTrace((module) => {
    module.JobWatcher?.onDispatch(name, queue, connection, data);
  });
};

const emitJobProcessed = (name: string): void => {
  withSystemTrace((module) => {
    module.JobWatcher?.onProcessed(name);
  });
};

const emitJobFailed = (name: string, error: Error): void => {
  withSystemTrace((module) => {
    module.JobWatcher?.onFailed(name, error);
  });
};

const emitNotification = (
  notification: string,
  channels: string[],
  notifiable?: string,
  message?: string,
  payload?: unknown
): void => {
  withSystemTrace((module) => {
    module.NotificationWatcher?.emit(notification, channels, notifiable, message, payload);
  });
};

const emitMail = (
  to: string,
  subject: string,
  template?: string,
  text?: string,
  html?: string
): void => {
  withSystemTrace((module) => {
    module.MailWatcher?.emit(to, subject, template, text, html);
  });
};

const emitHttpClient = (payload: {
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  responseStatus?: number;
  duration: number;
  requestBody?: unknown;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  error?: string;
}): void => {
  withSystemTrace((module) => {
    module.HttpClientWatcher?.emit(payload);
  });
};

const emitQuery = (
  query: string,
  params: unknown[],
  duration: number,
  connection?: string
): void => {
  withSystemTrace((module) => {
    module.QueryWatcher?.emit(query, params, duration, connection);
  });
};

const emitRedis = (command: string, duration: number): void => {
  withSystemTrace((module) => {
    module.RedisWatcher?.emit(command, duration);
  });
};

const emitEvent = (name: string, listenerCount: number, payload?: unknown): void => {
  withSystemTrace((module) => {
    module.EventWatcher?.emit(name, listenerCount, payload);
  });
};

const emitAuth = (event: 'login' | 'logout' | 'failed', userId?: string): void => {
  withSystemTrace((module) => {
    module.AuthWatcher?.emit(event, userId);
  });
};

const emitCommand = (
  name: string,
  args: Record<string, unknown>,
  exitCode: number,
  duration: number,
  output?: string
): void => {
  withSystemTrace((module) => {
    module.CommandWatcher?.emit(name, args, exitCode, duration, output);
  });
};

const preload = async (): Promise<boolean> => {
  const loaded = await loadSystemTrace();
  return loaded !== null;
};

export const SystemTraceBridge = Object.freeze({
  preload,
  emitAuth,
  emitCache,
  emitCommand,
  emitEvent,
  emitHttpClient,
  emitJobDispatch,
  emitJobFailed,
  emitJobProcessed,
  emitMail,
  emitNotification,
  emitQuery,
  emitRedis,
});

export default SystemTraceBridge;
