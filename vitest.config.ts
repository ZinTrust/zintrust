import { codecovVitePlugin } from '@codecov/vite-plugin';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

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
      '@cli': path.resolve(__dirname, './src/cli'),
      '@boot': path.resolve(__dirname, './src/boot'),
      '@orm': path.resolve(__dirname, './src/orm'),
      '@routing': path.resolve(__dirname, './src/routing'),
      '@middleware': path.resolve(__dirname, './src/middleware'),
      '@container': path.resolve(__dirname, './src/container'),
      '@http': path.resolve(__dirname, './src/http'),
      '@runtime': path.resolve(__dirname, './src/runtime'),
      '@database': path.resolve(__dirname, './src/database'),
      '@validation': path.resolve(__dirname, './src/validation'),
      '@security': path.resolve(__dirname, './src/security'),
      '@profiling': path.resolve(__dirname, './src/profiling'),
      '@performance': path.resolve(__dirname, './src/performance'),
      '@deployment': path.resolve(__dirname, './src/deployment'),
      '@cache': path.resolve(__dirname, './src/cache'),
      '@config': path.resolve(__dirname, './src/config'),
      '@common': path.resolve(__dirname, './src/common'),
      '@exceptions': path.resolve(__dirname, './src/exceptions'),
      '@functions': path.resolve(__dirname, './src/functions'),
      '@services': path.resolve(__dirname, './src/services'),
      '@app': path.resolve(__dirname, './app'),
      '@microservices': path.resolve(__dirname, './src/microservices'),
      '@routes': path.resolve(__dirname, './routes'),
      '@scripts': path.resolve(__dirname, './scripts'),
      '@node-singletons': path.resolve(__dirname, './src/node-singletons'),
      '@node-singletons/http': path.resolve(__dirname, './src/node-singletons/http.ts'),
      '@node-singletons/crypto': path.resolve(__dirname, './src/node-singletons/crypto.ts'),
      '@node-singletons/events': path.resolve(__dirname, './src/node-singletons/events.ts'),
      '@node-singletons/perf-hooks': path.resolve(__dirname, './src/node-singletons/perf-hooks.ts'),
      '@node-singletons/fs': path.resolve(__dirname, './src/node-singletons/fs.ts'),
      '@node-singletons/path': path.resolve(__dirname, './src/node-singletons/path.ts'),
      '@node-singletons/child-process': path.resolve(
        __dirname,
        './src/node-singletons/child-process.ts'
      ),
      '@node-singletons/url': path.resolve(__dirname, './src/node-singletons/url.ts'),
      '@node-singletons/os': path.resolve(__dirname, './src/node-singletons/os.ts'),
      '@node-singletons/readline': path.resolve(__dirname, './src/node-singletons/readline.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts', 'app/**/*.ts', 'routes/**/*.ts', 'scripts/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts', 'app/**/*.d.ts', 'routes/**/*.d.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 82,
        statements: 85,
      },
    },
    testTimeout: 10000,
  },
});
