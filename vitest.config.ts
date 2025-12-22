import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@cli': path.resolve(__dirname, './src/cli'),
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
      '@functions': path.resolve(__dirname, './src/functions'),
      '@services': path.resolve(__dirname, './src/services'),
      '@app': path.resolve(__dirname, './app'),
      '@microservices': path.resolve(__dirname, './src/microservices'),
      '@routes': path.resolve(__dirname, './routes'),
      '@scripts': path.resolve(__dirname, './scripts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts', 'app/**/*.ts', 'routes/**/*.ts', 'scripts/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts', 'app/**/*.d.ts', 'routes/**/*.d.ts'],
      lines: 90,
      functions: 90,
      branches: 85,
      statements: 90,
    },
    testTimeout: 10000,
  },
});
