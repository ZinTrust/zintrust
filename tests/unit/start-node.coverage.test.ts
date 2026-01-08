import nodeProcess, {
  FakeStorage,
  FileLogWriter,
  MailFake,
  cleanOnce,
  listNotificationTemplates,
  listTemplates,
} from '@/node';
import startWorker, { isNodeMain } from '@/start';
import { describe, expect, it } from 'vitest';

describe('start.ts + node.ts coverage', () => {
  it('exports are present and Worker entry is shaped', () => {
    expect(startWorker).toBeDefined();
    expect(startWorker).toHaveProperty('fetch');
    expect(typeof (startWorker as unknown as { fetch?: unknown }).fetch).toBe('function');

    expect(nodeProcess).toBeDefined();
    expect(cleanOnce).toBeTypeOf('function');
    expect(FileLogWriter).toBeDefined();
    expect(listTemplates).toBeTypeOf('function');
    expect(listNotificationTemplates).toBeTypeOf('function');
    expect(MailFake).toBeDefined();
    expect(FakeStorage).toBeDefined();
  });

  it('isNodeMain handles file URLs and invalid encoding', () => {
    const originalArgv = process.argv;

    try {
      process.argv = ['/usr/bin/node', '/tmp/app.js'];
      expect(isNodeMain('file:///tmp/app.js')).toBe(true);

      process.argv = ['/usr/bin/node', '/wrapper/tmp/app.js'];
      expect(isNodeMain('file:///tmp/app.js')).toBe(true);

      process.argv = ['/usr/bin/node', '/tmp/%E0%A4'];
      expect(isNodeMain('file:///tmp/%E0%A4')).toBe(true);

      process.argv = ['/usr/bin/node', 'plain-script.ts'];
      expect(isNodeMain('plain-script.ts')).toBe(true);

      process.argv = ['/usr/bin/node'];
      expect(isNodeMain('file:///tmp/app.js')).toBe(false);
    } finally {
      process.argv = originalArgv;
    }
  });
});
