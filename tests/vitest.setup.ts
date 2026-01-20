// Global Vitest setup
// Ensures required secrets exist so config modules can be imported safely in unit tests.

(process.env as Record<string, string>)['JWT_SECRET'] ??= 'test-jwt-secret';

import path from 'node:path';
import { vi } from 'vitest';

// Ensure any import of '@zintrust/core' used in tests has a NodeSingletons.path
// so modules that access NodeSingletons.path at import-time don't throw.
vi.mock('@zintrust/core', async () => {
  const actual = await vi.importActual('@zintrust/core');
  return {
    ...(actual as Record<string, unknown>),
    NodeSingletons: {
      ...(Object(actual).NodeSingletons ?? {}),
      path,
    },
  } as unknown;
});

// Provide a lightweight virtual `config/queue` module for tests that import
// app workers or controllers which may reference it.
vi.mock(
  'config/queue',
  () => ({
    default: {
      drivers: { redis: { host: '127.0.0.1', port: 6379, db: 0 } },
      queues: {},
    },
  }),
  { virtual: true }
);
