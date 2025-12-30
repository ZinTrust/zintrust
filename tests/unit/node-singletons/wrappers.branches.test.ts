import { expect, test } from 'vitest';

// These tests are small smoke/branch tests for node-singletons wrapper modules
// to increase branch coverage by exercising their runtime exports.

test('child-process exports execSync and spawn', async () => {
  const { execSync, spawn } = await import('@node-singletons/child-process');
  expect(typeof execSync).toBe('function');
  expect(typeof spawn).toBe('function');
});

test('crypto exports randomBytes and randomInt', async () => {
  const { randomBytes, randomInt } = await import('@node-singletons/crypto');
  expect(typeof randomBytes).toBe('function');
  expect(Buffer.isBuffer(randomBytes(4))).toBe(true);
  const r = randomInt(1, 2);
  expect(Number.isInteger(r)).toBe(true);
  expect(r === 1 || r === 2).toBe(true);
});

test('events exports EventEmitter', async () => {
  const { EventEmitter } = await import('@node-singletons/events');
  expect(typeof EventEmitter).toBe('function');
  const ee = new EventEmitter();
  let seen = false;
  ee.on('x', () => (seen = true));
  ee.emit('x');
  expect(seen).toBe(true);
});

test('http exports createServer and types exist', async () => {
  const { createServer } = await import('@node-singletons/http');
  expect(typeof createServer).toBe('function');
});

test('fs exports fs default and promises + helpers', async () => {
  const fsModule = await import('@node-singletons/fs');
  expect(typeof fsModule).toBe('object');
  expect(typeof fsModule.existsSync).toBe('function');
  expect(typeof fsModule.readFile).toBe('function');
  // read a small file (this test file) to ensure promises path works
  const content = await fsModule.readFile(__filename, 'utf8');
  expect(typeof content).toBe('string');
});

test('os exports tmpdir and cpus', async () => {
  const os = await import('@node-singletons/os');
  expect(typeof os.tmpdir).toBe('function');
  expect(Array.isArray(os.cpus())).toBe(true);
});

test('path exports join and resolve', async () => {
  const { join, resolve } = await import('@node-singletons/path');
  expect(typeof join).toBe('function');
  const p = join('a', 'b');
  expect(p).toContain('a');
  expect(typeof resolve).toBe('function');
});

test('perf-hooks exports performance', async () => {
  const { performance } = await import('@node-singletons/perf-hooks');
  expect(typeof performance.now).toBe('function');
});

test('readline exports createInterface and default module', async () => {
  const rl = await import('@node-singletons/readline');
  expect(typeof rl.createInterface).toBe('function');
  // default export should be an object
  expect(typeof rl.default).toBe('object');
});

test('url exports pathToFileURL and fileURLToPath', async () => {
  const { pathToFileURL, fileURLToPath } = await import('@node-singletons/url');
  expect(typeof pathToFileURL).toBe('function');
  expect(typeof fileURLToPath).toBe('function');
  const u = pathToFileURL(__filename);
  expect(fileURLToPath(u)).toBe(__filename);
});
