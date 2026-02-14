import { CLI } from '@/cli/CLI';
import { describe, expect, it, vi } from 'vitest';

type ExitFn = typeof process.exit;

describe('CLI RoutesCommand', () => {
  it('prints a route table for zin routes', async () => {
    process.env['BASE_URL'] = 'http://127.0.0.1';
    process.env['PORT'] = '7777';

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const cli = CLI.create();
    await cli.run(['routes']);

    const output = logSpy.mock.calls.map((c) => String(c[0] ?? '')).join('\n');

    expect(output).toContain('┌');
    expect(output).toContain('Group');
    expect(output).toContain('Method');
    expect(output).toContain('Path');
    expect(output).toContain('http://127.0.0.1:7777');
    expect(output).toContain('/health');

    logSpy.mockRestore();
  });

  it('prints JSON when --json is used', async () => {
    process.env['BASE_URL'] = 'http://127.0.0.1';
    process.env['PORT'] = '7777';

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const cli = CLI.create();
    await cli.run(['routes', '--json', '--group-by', 'none', '--method', 'GET']);

    const outputLines = logSpy.mock.calls.map((c) => String(c[0] ?? '')).filter(Boolean);
    const jsonPayload = outputLines.find((l) => l.trim().startsWith('{'));
    expect(jsonPayload).toBeDefined();

    const parsed = JSON.parse(String(jsonPayload)) as {
      count: number;
      routes: Array<{ method: string }>;
    };

    expect(typeof parsed.count).toBe('number');
    expect(Array.isArray(parsed.routes)).toBe(true);
    expect(parsed.routes.length).toBeGreaterThan(0);
    expect(parsed.routes[0]?.method).toBe('GET');

    logSpy.mockRestore();
  });

  it('exits with an error for an invalid --group-by value', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${String(code ?? '')}`);
    }) as ExitFn);

    const cli = CLI.create();

    await expect(cli.run(['routes', '--group-by', 'nope'])).rejects.toThrow(
      /process\.exit:1|process\.exit:2/
    );

    exitSpy.mockRestore();
  });

  it('omits origin when BASE_URL is path-only', async () => {
    process.env['BASE_URL'] = '/';
    process.env['PORT'] = '7777';

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const cli = CLI.create();
    await cli.run(['routes', '--json', '--method', ',']);

    const outputLines = logSpy.mock.calls.map((c) => String(c[0] ?? '')).filter(Boolean);
    const jsonPayload = outputLines.find((l) => l.trim().startsWith('{'));
    expect(jsonPayload).toBeDefined();

    const parsed = JSON.parse(String(jsonPayload)) as {
      routes: Array<{ url: string }>;
    };

    expect(parsed.routes.length).toBeGreaterThan(0);
    expect(parsed.routes[0]?.url.startsWith('/')).toBe(true);
    expect(parsed.routes[0]?.url.includes('://')).toBe(false);

    logSpy.mockRestore();
  });
});
