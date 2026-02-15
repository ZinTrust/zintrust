import { codecovVitePlugin } from '@codecov/vite-plugin';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const COVERAGE_STRICT = process.env.COVERAGE_STRICT === 'true';
const coverageThresholds = COVERAGE_STRICT
  ? {
      lines: 83,
      functions: 83,
      branches: 83,
      statements: 83,
    }
  : {
      // Defaults tuned to the current repo state so `npm run test:coverage` and `npm run coverage:patch`
      // are usable locally. For CI-grade gating, set `COVERAGE_STRICT=true`.
      lines: 82,
      functions: 82,
      branches: 78,
      statements: 82,
    };

export default defineConfig({
  plugins: [
    // Put the Codecov vite plugin after all other plugins
    codecovVitePlugin({
      enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
      bundleName: 'zintrust',
      uploadToken: process.env.CODECOV_TOKEN,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@zintrust/core/node': path.resolve(__dirname, './src/node.ts'),
      '@zintrust/core/proxy': path.resolve(__dirname, './src/proxy.ts'),
      '@zintrust/core/start': path.resolve(__dirname, './src/start.ts'),
      '@zintrust/core': path.resolve(__dirname, './src/index.ts'),
      '@zintrust/queue-monitor': path.resolve(__dirname, './packages/queue-monitor/src/index.ts'),
      '@zintrust/workers': path.resolve(__dirname, './packages/workers/src/index.ts'),
      '@zintrust/queue-redis': path.resolve(__dirname, './packages/queue-redis/src/index.ts'),
      '@zintrust/cloudflare-kv-proxy': path.resolve(
        __dirname,
        './packages/cloudflare-kv-proxy/src/index.ts'
      ),
      '@zintrust/cloudflare-d1-proxy': path.resolve(
        __dirname,
        './packages/cloudflare-d1-proxy/src/index.ts'
      ),
      '@cli': path.resolve(__dirname, './src/cli'),
      '@registry': path.resolve(__dirname, './src/boot/registry'),
      '@boot': path.resolve(__dirname, './src/boot'),
      '@proxy': path.resolve(__dirname, './src/proxy'),
      '@lang': path.resolve(__dirname, './src/lang'),
      '@core-routes': path.resolve(__dirname, './src/routes'),
      '@orm': path.resolve(__dirname, './src/orm'),
      '@types': path.resolve(__dirname, './src/types'),
      '@sockets': path.resolve(__dirname, './src/sockets'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@workers': path.resolve(__dirname, './src/workers'),
      '@middleware': path.resolve(__dirname, './src/middleware'),
      '@container': path.resolve(__dirname, './src/container'),
      '@migrations': path.resolve(__dirname, './src/migrations'),
      '@http': path.resolve(__dirname, './src/http'),
      '@httpClient': path.resolve(__dirname, './src/tools/http'),
      '@runtime': path.resolve(__dirname, './src/runtime'),
      '@database': path.resolve(__dirname, './src/database'),
      '@validation': path.resolve(__dirname, './src/validation'),
      '@security': path.resolve(__dirname, './src/security'),
      '@profiling': path.resolve(__dirname, './src/profiling'),
      '@performance': path.resolve(__dirname, './src/performance'),
      '@deployment': path.resolve(__dirname, './src/deployment'),
      '@cache': path.resolve(__dirname, './src/cache'),
      '@config': path.resolve(__dirname, './src/config'),
      '@runtime-config': path.resolve(__dirname, './config'),
      '@common': path.resolve(__dirname, './src/common'),
      '@scheduler': path.resolve(__dirname, './src/scheduler'),
      '@schedules': path.resolve(__dirname, './src/schedules'),
      '@exceptions': path.resolve(__dirname, './src/exceptions'),
      '@events': path.resolve(__dirname, './src/events'),
      '@session': path.resolve(__dirname, './src/session'),
      '@functions': path.resolve(__dirname, './src/functions'),
      '@services': path.resolve(__dirname, './src/services'),
      '@app': path.resolve(__dirname, './app'),
      '@microservices': path.resolve(__dirname, './src/microservices'),
      '@tools': path.resolve(__dirname, './src/tools'),
      '@toolkit': path.resolve(__dirname, './src/toolkit'),
      '@mail': path.resolve(__dirname, './src/tools/mail'),
      '@notification': path.resolve(__dirname, './src/tools/notification'),
      '@templates': path.resolve(__dirname, './src/tools/templates'),
      '@auth': path.resolve(__dirname, './src/auth'),
      '@queue': path.resolve(__dirname, './src/tools/queue'),
      '@queue/*': path.resolve(__dirname, './src/tools/queue/*'),
      '@broadcast': path.resolve(__dirname, './src/tools/broadcast'),
      // NOTE: Scoped-looking aliases like "@storage/drivers/Gcs" have been flaky to resolve
      // on some runners unless the "/"-suffixed prefix alias is present.
      '@drivers': path.resolve(__dirname, './src/tools/storage/drivers'),
      '@storage': path.resolve(__dirname, './src/tools/storage'),
      '@storage/*': path.resolve(__dirname, './src/tools/storage/*'),
      '@routes': path.resolve(__dirname, './routes'),
      '@scripts': path.resolve(__dirname, './scripts'),
      '@node-singletons': path.resolve(__dirname, './src/node-singletons'),
      '@time': path.resolve(__dirname, './src/time'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
    setupFiles: ['tests/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts', 'app/**/*.ts', 'routes/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'packages/**',
        // Auto-generated by plugin system; excluded from tsconfig and not meaningful for coverage.
        'src/zintrust.plugins.ts',
        // Exclude non-executable barrels / type-only modules (V8 often reports 0% even when imported)
        'app/Types/**/*.ts',
        'app/Controllers/UserController.ts',
        // Local test files (not part of the main codebase)
        'app/Controllers/TestController.ts',
        'app/Workers/TestWorker.ts',
        'routes/apiDev.ts',
        'src/collections/index.ts',
        'src/events/index.ts',
        'src/session/index.ts',
        'src/testing/index.ts',
        'src/tools/notification/Driver.ts',
        // Avoid pulling all barrel files into coverage (noise), but keep the
        // root entrypoint + Storage entrypoint included since they are part of
        // patch/diff coverage gates and may change.
        'src/cli/commands/index.ts',
        'src/cli/config/index.ts',
        'src/cli/index.ts',
        'src/cli/scaffolding/index.ts',
        'src/common/index.ts',
        'src/config/index.ts',
        'src/database/migrations/index.ts',
        'src/middleware/index.ts',
        'src/node-singletons/index.ts',
        'src/scheduler/index.ts',
        'src/schedules/index.ts',
        'src/toolkit/Secrets/index.ts',
        'src/tools/broadcast/index.ts',
        'src/tools/http/index.ts',
        'src/tools/mail/templates/index.ts',
        'src/tools/mail/templates/markdown/index.ts',
        'src/tools/notification/templates/markdown/index.ts',
        'src/tools/templates/index.ts',
        // Integration/runtime-only surfaces not exercised by unit suite.
        'app/Workers/**',
        'routes/DirectMysqlTestRoutes.ts',
        // Keep queue internals excluded except files covered by patch tests.
        'src/tools/queue/AdvancedQueue.ts',
        'src/tools/queue/DeduplicationBuilder.ts',
        'src/tools/queue/IdempotencyManager.ts',
        'src/tools/queue/JobHeartbeatStore.ts',
        'src/tools/queue/JobReconciliationRunner.ts',
        'src/tools/queue/JobRecoveryDaemon.ts',
        'src/tools/queue/JobStateTracker.ts',
        'src/tools/queue/JobStateTrackerDbPersistence.ts',
        'src/tools/queue/LockProvider.ts',
        'src/tools/queue/QueueDataRedactor.ts',
        'src/tools/queue/QueueExtensions.ts',
        'src/tools/queue/QueueReliabilityMetrics.ts',
        'src/tools/queue/QueueReliabilityOrchestrator.ts',
        'src/tools/queue/QueueRuntimeRegistration.ts',
        'src/tools/queue/StalledJobMonitor.ts',
        'src/tools/queue/TimeoutManager.ts',
        'src/tools/queue/drivers/**',
        'src/tools/queue/index.ts',
        'src/runtime/WorkersModule.ts',
        'src/runtime/RuntimeServices.ts',
        'src/routes/errorPages.ts',
        'src/sockets/CloudflareSocket.ts',
        'src/tools/mail/template-loader.ts',
        // Low-signal operational CLI commands (covered by integration/manual flows).
        'src/**/types.ts',
        'src/scripts/**',
        'src/features/**',
        'src/node-singletons/**',
        'app/**/*.d.ts',
        'routes/**/*.d.ts',
        'processors/*',
      ],
      thresholds: coverageThresholds,
    },
    testTimeout: 10000,
  },
});
