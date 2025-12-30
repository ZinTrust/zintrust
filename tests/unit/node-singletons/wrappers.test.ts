import { describe, expect, it } from 'vitest';

import { createHash, randomBytes } from '@node-singletons/crypto';
import { EventEmitter } from '@node-singletons/events';
import * as fs from '@node-singletons/fs';
import * as http from '@node-singletons/http';
import * as os from '@node-singletons/os';
import * as path from '@node-singletons/path';
import { performance } from '@node-singletons/perf-hooks';
import { createInterface } from '@node-singletons/readline';
import { fileURLToPath, pathToFileURL } from '@node-singletons/url';

describe('node-singletons wrappers', () => {
  it('crypto exports work', () => {
    expect(typeof createHash).toBe('function');
    const h = createHash('sha256');
    h.update('test');
    const digest = h.digest('hex');
    expect(typeof digest).toBe('string');

    const buf = randomBytes(4);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBe(4);
  });

  it('fs exports work', async () => {
    // use temporary file in OS tmpdir
    const tmp = os.tmpdir();
    const file = path.join(tmp, `zintrust-test-${Date.now()}.txt`);
    fs.writeFileSync(file, 'ok');
    expect(fs.existsSync(file)).toBe(true);
    const contents = await fs.readFile(file, 'utf8');
    expect(contents.trim()).toBe('ok');
    fs.unlinkSync(file);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('events exports work', () => {
    const e = new EventEmitter();
    let called = false;
    e.on('x', () => (called = true));
    e.emit('x');
    expect(called).toBe(true);
  });

  it('path/url/os/perf/readline/http exports work', () => {
    expect(typeof path.join).toBe('function');
    const p = path.join('a', 'b');
    expect(typeof p).toBe('string');

    const url = pathToFileURL('/tmp/foo');
    expect(typeof fileURLToPath(url)).toBe('string');

    expect(typeof os.platform).toBe('function');
    expect(typeof os.tmpdir).toBe('function');

    const now = performance.now();
    expect(typeof now).toBe('number');

    expect(typeof createInterface).toBe('function');

    expect(typeof http.createServer).toBe('function');
  });
});
