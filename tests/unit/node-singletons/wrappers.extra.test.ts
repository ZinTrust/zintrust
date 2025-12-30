import * as childProcess from '@node-singletons/child-process';
import * as crypto from '@node-singletons/crypto';
import * as events from '@node-singletons/events';
import * as fs from '@node-singletons/fs';
import * as http from '@node-singletons/http';
import * as os from '@node-singletons/os';
import * as path from '@node-singletons/path';
import * as perf from '@node-singletons/perf-hooks';
import * as readline from '@node-singletons/readline';
import * as url from '@node-singletons/url';
import { describe, expect, test } from 'vitest';

describe('Node singletons smoke tests', () => {
  test('child-process exports functions', () => {
    expect(typeof childProcess.execSync).toBe('function');
    expect(typeof childProcess.spawn).toBe('function');
  });

  test('crypto exports randomBytes and randomInt', () => {
    const buf = crypto.randomBytes(4);
    expect(buf).toBeInstanceOf(Buffer);
    const n = crypto.randomInt(0, 10);
    expect(typeof n).toBe('number');
  });

  test('fs exports and default', () => {
    expect(typeof fs.readFile).toBe('function');
    expect(fs.fsPromises).toBeTruthy();
    expect(typeof fs.default).toBe('object');
  });

  test('events export exists', () => {
    expect(typeof events.EventEmitter).toBe('function');
  });

  test('http exports createServer', () => {
    expect(typeof http.createServer).toBe('function');
  });

  test('os exports arch and tmpdir', () => {
    expect(typeof os.arch).toBe('function');
    expect(typeof os.tmpdir).toBe('function');
  });

  test('path join works', () => {
    expect(path.join('a', 'b')).toMatch(/a[\\/]{1}b/);
  });

  test('perf performance.now returns number', () => {
    expect(typeof perf.performance.now()).toBe('number');
  });

  test('readline default and createInterface exist', () => {
    expect(typeof readline.createInterface).toBe('function');
    expect(typeof readline.default).toBe('object');
  });

  test('url fileURLToPath works', () => {
    const p = url.fileURLToPath(new URL('file:///tmp/test-file'));
    expect(p).toContain('/tmp/test-file');
  });
});
