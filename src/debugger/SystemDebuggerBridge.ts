type SystemDebuggerModule = Partial<{
  CacheWatcher: {
    emit: (
      operation: 'get' | 'set' | 'delete' | 'clear' | 'has',
      key: string,
      duration: number,
      hit?: boolean
    ) => void;
  };
  JobWatcher: {
    onDispatch: (name: string, queue: string, connection: string, data?: unknown) => void;
    onProcessed: (name: string) => void;
    onFailed: (name: string, error: Error) => void;
  };
  NotificationWatcher: {
    emit: (notification: string, channels: string[], notifiable?: string) => void;
  };
  MailWatcher: {
    emit: (to: string, subject: string, template?: string) => void;
  };
  HttpClientWatcher: {
    emit: (
      method: string,
      url: string,
      requestHeaders: Record<string, string>,
      responseStatus: number,
      duration: number
    ) => void;
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

let cachedModule: SystemDebuggerModule | null | undefined;
let loadPromise: Promise<SystemDebuggerModule | null> | null = null;

const importSystemDebugger = async (): Promise<SystemDebuggerModule | null> => {
  try {
    return (await import('@zintrust/system-debugger')) as unknown as SystemDebuggerModule;
  } catch {
    return null;
  }
};

const loadSystemDebugger = async (): Promise<SystemDebuggerModule | null> => {
  if (cachedModule !== undefined) return cachedModule;
  if (loadPromise !== null) return loadPromise;

  loadPromise = importSystemDebugger().then((loaded) => {
    cachedModule = loaded;
    loadPromise = null;
    return loaded;
  });

  return loadPromise;
};

const withSystemDebugger = (run: (module: SystemDebuggerModule) => void): void => {
  const invoke = (module: SystemDebuggerModule | null | undefined): void => {
    if (module === null || module === undefined) return;

    try {
      run(module);
    } catch {
      // Ignore optional debugger failures so core runtime behavior is unaffected.
    }
  };

  if (cachedModule !== undefined) {
    invoke(cachedModule);
    return;
  }

  void loadSystemDebugger()
    .then(invoke)
    .catch(() => undefined);
};

const emitCache = (
  operation: 'get' | 'set' | 'delete' | 'clear' | 'has',
  key: string,
  duration: number,
  hit?: boolean
): void => {
  withSystemDebugger((module) => {
    module.CacheWatcher?.emit(operation, key, duration, hit);
  });
};

const emitJobDispatch = (name: string, queue: string, connection: string, data?: unknown): void => {
  withSystemDebugger((module) => {
    module.JobWatcher?.onDispatch(name, queue, connection, data);
  });
};

const emitJobProcessed = (name: string): void => {
  withSystemDebugger((module) => {
    module.JobWatcher?.onProcessed(name);
  });
};

const emitJobFailed = (name: string, error: Error): void => {
  withSystemDebugger((module) => {
    module.JobWatcher?.onFailed(name, error);
  });
};

const emitNotification = (notification: string, channels: string[], notifiable?: string): void => {
  withSystemDebugger((module) => {
    module.NotificationWatcher?.emit(notification, channels, notifiable);
  });
};

const emitMail = (to: string, subject: string, template?: string): void => {
  withSystemDebugger((module) => {
    module.MailWatcher?.emit(to, subject, template);
  });
};

const emitHttpClient = (
  method: string,
  url: string,
  requestHeaders: Record<string, string>,
  responseStatus: number,
  duration: number
): void => {
  withSystemDebugger((module) => {
    module.HttpClientWatcher?.emit(method, url, requestHeaders, responseStatus, duration);
  });
};

const emitEvent = (name: string, listenerCount: number, payload?: unknown): void => {
  withSystemDebugger((module) => {
    module.EventWatcher?.emit(name, listenerCount, payload);
  });
};

const emitAuth = (event: 'login' | 'logout' | 'failed', userId?: string): void => {
  withSystemDebugger((module) => {
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
  withSystemDebugger((module) => {
    module.CommandWatcher?.emit(name, args, exitCode, duration, output);
  });
};

const preload = async (): Promise<boolean> => {
  const loaded = await loadSystemDebugger();
  return loaded !== null;
};

export const SystemDebuggerBridge = Object.freeze({
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
});

export default SystemDebuggerBridge;
