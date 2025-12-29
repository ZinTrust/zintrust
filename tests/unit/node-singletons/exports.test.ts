import { describe, expect, it } from 'vitest';

import * as child from '@/node-singletons/child-process';
import * as crypto from '@/node-singletons/crypto';
import * as fs from '@/node-singletons/fs';
import * as net from '@/node-singletons/net';
import * as os from '@/node-singletons/os';
import * as path from '@/node-singletons/path';
import * as tls from '@/node-singletons/tls';

describe('node-singletons exports', () => {
  it('child-process exports functions', () => {
    expect(typeof child.execSync).toBe('function');
    expect(typeof child.spawn).toBe('function');
  });

  it('crypto exports functions', () => {
    expect(typeof crypto.createHash).toBe('function');
    expect(typeof crypto.randomBytes).toBe('function');
  });

  it('fs exports promises and functions', () => {
    expect(typeof fs.fsPromises.readFile).toBe('function');
    expect(typeof fs.readFileSync).toBe('function');
  });

  it('net exports functions', () => {
    expect(typeof net.connect).toBe('function');
  });

  it('path and os are objects', () => {
    expect(typeof path.resolve).toBe('function');
    expect(typeof os.platform).toBe('function');
  });

  it('tls exports connect', () => {
    expect(typeof tls.connect).toBe('function');
  });
});
