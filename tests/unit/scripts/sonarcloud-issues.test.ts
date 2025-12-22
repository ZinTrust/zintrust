import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const issuesState = vi.hoisted(() => {
  return {
    failNextRequest: false,
    statusCode: 200,
    invalidJson: false,
    mode: 'normal' as 'normal' | 'noIssues' | 'missingSnippet',
    fileExists: true,
    reportsDirExists: false,
    uncoveredHasComponents: true,
    lastRequestOptions: undefined as HttpsRequestOptions | undefined,
    reset() {
      this.failNextRequest = false;
      this.statusCode = 200;
      this.invalidJson = false;
      this.mode = 'normal';
      this.fileExists = true;
      this.reportsDirExists = false;
      this.uncoveredHasComponents = true;
      this.lastRequestOptions = undefined;
    },
  };
});

type HttpsRequestOptions = {
  hostname?: string;
  path?: string;
  method?: string;
  headers?: Record<string, string>;
};

vi.mock('node:https', () => {
  return {
    request: (options: HttpsRequestOptions, cb: (res: unknown) => void) => {
      issuesState.lastRequestOptions = options;
      let onError: ((error: Error) => void) | undefined;
      const responseHandlers: Record<string, ((chunk?: Buffer) => void) | undefined> = {};

      const res = {
        statusCode: issuesState.statusCode,
        on: (event: string, handler: (chunk?: Buffer) => void) => {
          responseHandlers[event] = handler;
        },
      };

      cb(res);

      const req = {
        on: (event: string, handler: (error: Error) => void) => {
          if (event === 'error') onError = handler;
          return req;
        },
        end: () => {
          if (issuesState.failNextRequest) {
            issuesState.failNextRequest = false;
            onError?.(new Error('network error'));
            return;
          }

          const requestPath = options.path ?? '';
          let body = '';

          if (requestPath.startsWith('/api/issues/search?')) {
            const url = new URL(`https://sonarcloud.io${requestPath}`);
            const page = Number(url.searchParams.get('p') ?? '1');
            const total =
              issuesState.mode === 'normal' || issuesState.mode === 'missingSnippet' ? 3 : 1;
            const pageSize = 1;

            const issue = (() => {
              if (issuesState.mode === 'noIssues') {
                return {
                  key: 'ISSUE-DOCS',
                  rule: 'typescript:S000',
                  severity: 'MINOR',
                  component: 'ZinTrust_ZinTrust:docs-website/index.html',
                  project: 'ZinTrust_ZinTrust',
                  line: 1,
                  hash: 'docs',
                  flows: [],
                  status: 'OPEN',
                  message: 'Ignored docs issue',
                  tags: [],
                  creationDate: '2020-01-01',
                  updateDate: '2020-01-01',
                  type: 'CODE_SMELL',
                  organization: 'ZinTrust_ZinTrust',
                };
              }

              if (page === 1) {
                return {
                  key: 'ISSUE-1',
                  rule: 'typescript:S123',
                  severity: 'MAJOR',
                  component: 'ZinTrust_ZinTrust:src/foo.ts',
                  project: 'ZinTrust_ZinTrust',
                  line: 3,
                  hash: 'h1',
                  flows: [],
                  status: 'OPEN',
                  message: 'Issue one',
                  tags: [],
                  creationDate: '2020-01-01',
                  updateDate: '2020-01-01',
                  type: 'BUG',
                  organization: 'ZinTrust_ZinTrust',
                  cleanCodeAttribute: 'CONSISTENT',
                  cleanCodeAttributeCategory: 'READABILITY',
                  impacts: [{ softwareQuality: 'RELIABILITY', severity: 'HIGH' }],
                };
              }

              if (page === 2) {
                return {
                  key: 'ISSUE-2',
                  rule: 'typescript:S456',
                  severity: 'MINOR',
                  component: 'ZinTrust_ZinTrust:src/bar.ts',
                  project: 'ZinTrust_ZinTrust',
                  line: 0,
                  hash: 'h2',
                  flows: [],
                  status: 'OPEN',
                  message: 'Issue two',
                  tags: [],
                  creationDate: '2020-01-01',
                  updateDate: '2020-01-01',
                  type: 'CODE_SMELL',
                  organization: 'ZinTrust_ZinTrust',
                };
              }

              return {
                key: 'ISSUE-3',
                rule: 'typescript:S999',
                severity: 'MINOR',
                component: 'ZinTrust_ZinTrust:docs-website/index.html',
                project: 'ZinTrust_ZinTrust',
                line: 0,
                hash: 'h3',
                flows: [],
                status: 'OPEN',
                message: 'Ignored docs issue',
                tags: [],
                creationDate: '2020-01-01',
                updateDate: '2020-01-01',
                type: 'CODE_SMELL',
                organization: 'ZinTrust_ZinTrust',
              };
            })();

            body = JSON.stringify({
              total,
              p: page,
              ps: pageSize,
              paging: { pageIndex: page, pageSize, total },
              issues: [issue],
              components: [],
              facets: [],
            });
          } else if (requestPath.startsWith('/api/measures/component?')) {
            body = JSON.stringify({ component: { key: 'ZinTrust_ZinTrust', measures: [] } });
          } else if (requestPath.startsWith('/api/measures/component_tree?')) {
            body = JSON.stringify(
              issuesState.uncoveredHasComponents
                ? {
                    components: [
                      {
                        path: 'src/foo.ts',
                        measures: [
                          { metric: 'coverage', value: '50.0' },
                          { metric: 'uncovered_lines', value: '10' },
                        ],
                      },
                      {
                        path: 'src/bar.ts',
                        measures: [
                          { metric: 'coverage', value: '70.0' },
                          { metric: 'uncovered_lines', value: '3' },
                        ],
                      },
                    ],
                  }
                : {}
            );
          } else {
            body = JSON.stringify({ ok: true });
          }

          if (issuesState.invalidJson) {
            body = 'not-json';
          }

          responseHandlers['data']?.(Buffer.from(body));
          responseHandlers['end']?.();
        },
      };

      return req;
    },
  };
});

vi.mock('node:fs', () => {
  return {
    existsSync: vi.fn((p: unknown) => {
      const value = String(p);
      if (value.endsWith('/.env')) return false;
      if (value.endsWith(`${path.sep}reports`) || value.endsWith(`${path.sep}reports${path.sep}`)) {
        return issuesState.reportsDirExists;
      }
      if (value.endsWith(`${path.sep}src${path.sep}foo.ts`)) return issuesState.fileExists;
      return false;
    }),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn((p: unknown) => {
      const value = String(p);
      if (value.endsWith(`${path.sep}src${path.sep}foo.ts`)) {
        return ['line1', 'line2', 'line3', 'line4', 'line5'].join('\n');
      }
      return '';
    }),
    writeFileSync: vi.fn(),
  };
});

describe('scripts/sonarcloud-issues', () => {
  const scriptPath = '/opt/homebrew/var/www/Sites/cako/zintrust/scripts/sonarcloud-issues.ts';
  const originalArgv = process.argv;
  const originalExit = process.exit;
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    process.env = { ...originalEnv };
    issuesState.reset();
    vi.restoreAllMocks();
  });

  it('runs main when executed directly and writes reports', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    process.argv = ['node', scriptPath, '--measures', '--uncovered', '--open', '--types=BUG'];
    process.env['SONAR_TOKEN'] = 'token';

    vi.resetModules();
    await import('@scripts/sonarcloud-issues');

    expect(logSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    const fs = await import('node:fs');
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalled();
  });

  it('covers the "no issues fetched" branch when all issues are filtered', async () => {
    issuesState.mode = 'noIssues';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    process.argv = ['node', scriptPath];

    vi.resetModules();
    await import('@scripts/sonarcloud-issues');

    expect(logSpy).toHaveBeenCalledWith('\n✓ No issues fetched\n');
  });

  it('covers missing-snippet fallback in getCodeSnippet', async () => {
    issuesState.mode = 'missingSnippet';
    issuesState.fileExists = false;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    process.argv = ['node', scriptPath];

    vi.resetModules();
    await import('@scripts/sonarcloud-issues');
  });

  it('covers uncovered-files summary guard false branch (no components array)', async () => {
    issuesState.uncoveredHasComponents = false;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    process.argv = ['node', scriptPath, '--uncovered'];

    vi.resetModules();
    await import('@scripts/sonarcloud-issues');

    expect(logSpy).not.toHaveBeenCalledWith('\nUncovered Files Summary (< 80%):');
  });

  it('sets Authorization header only when token is provided', async () => {
    process.argv = ['node', 'vitest'];
    vi.resetModules();

    const { SonarCloudClient } = await import('@scripts/sonarcloud-issues');
    const withToken = new SonarCloudClient('org', 'project', 'token');
    await withToken.fetchIssues();

    const tokenHeaders = issuesState.lastRequestOptions?.headers;
    expect(tokenHeaders).toBeDefined();
    expect(tokenHeaders).toHaveProperty('Authorization');

    issuesState.lastRequestOptions = undefined;
    const withoutToken = new SonarCloudClient('org', 'project');
    await withoutToken.fetchIssues();

    const noTokenHeaders = (issuesState.lastRequestOptions as any)?.headers;
    expect(noTokenHeaders).toBeDefined();
    expect(noTokenHeaders).not.toHaveProperty('Authorization');
  });

  it('rejects when request emits an error event (covers req.on("error"))', async () => {
    process.argv = ['node', 'vitest'];
    vi.resetModules();

    const { SonarCloudClient } = await import('@scripts/sonarcloud-issues');
    const client = new SonarCloudClient('org', 'project', 'token');
    issuesState.failNextRequest = true;

    await expect(client.fetchMeasures(['coverage'])).rejects.toThrow(/network error/);
  });

  it('rejects fetchIssues when request emits an error event', async () => {
    process.argv = ['node', 'vitest'];
    vi.resetModules();

    const { SonarCloudClient } = await import('@scripts/sonarcloud-issues');
    const client = new SonarCloudClient('org', 'project', 'token');
    issuesState.failNextRequest = true;

    await expect(client.fetchIssues()).rejects.toThrow(/network error/);
  });

  it('rejects fetchMeasures on invalid JSON', async () => {
    process.argv = ['node', 'vitest'];
    vi.resetModules();

    const { SonarCloudClient } = await import('@scripts/sonarcloud-issues');
    const client = new SonarCloudClient('org', 'project', 'token');
    issuesState.invalidJson = true;

    await expect(client.fetchMeasures(['coverage'])).rejects.toThrow(/Failed to parse response/);
  });

  it('rejects fetchMeasures on non-200 HTTP status', async () => {
    process.argv = ['node', 'vitest'];
    vi.resetModules();

    const { SonarCloudClient } = await import('@scripts/sonarcloud-issues');
    const client = new SonarCloudClient('org', 'project', 'token');
    issuesState.statusCode = 500;

    await expect(client.fetchMeasures(['coverage'])).rejects.toThrow(/HTTP 500/);
  });

  it('rejects fetchUncoveredFiles on invalid JSON', async () => {
    process.argv = ['node', 'vitest'];
    vi.resetModules();

    const { SonarCloudClient } = await import('@scripts/sonarcloud-issues');
    const client = new SonarCloudClient('org', 'project', 'token');
    issuesState.invalidJson = true;

    await expect(client.fetchUncoveredFiles()).rejects.toThrow(/Failed to parse response/);
  });

  it('rejects fetchUncoveredFiles on non-200 HTTP status', async () => {
    process.argv = ['node', 'vitest'];
    vi.resetModules();

    const { SonarCloudClient } = await import('@scripts/sonarcloud-issues');
    const client = new SonarCloudClient('org', 'project', 'token');
    issuesState.statusCode = 500;

    await expect(client.fetchUncoveredFiles()).rejects.toThrow(/HTTP 500/);
  });

  it('rejects fetchUncoveredFiles when request emits an error event', async () => {
    process.argv = ['node', 'vitest'];
    vi.resetModules();

    const { SonarCloudClient } = await import('@scripts/sonarcloud-issues');
    const client = new SonarCloudClient('org', 'project', 'token');
    issuesState.failNextRequest = true;

    await expect(client.fetchUncoveredFiles()).rejects.toThrow(/network error/);
  });

  it('exits with code 1 on HTTP error', async () => {
    const exitMock: typeof process.exit = ((code?: number) => {
      throw new Error(`process.exit:${code ?? 'undefined'}`);
    }) as unknown as typeof process.exit;
    process.exit = exitMock;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    process.argv = ['node', scriptPath];
    issuesState.statusCode = 500;

    vi.resetModules();
    await expect(import('@scripts/sonarcloud-issues')).rejects.toThrow(/process\.exit:1/);
  });

  it('rejects when response JSON is invalid', async () => {
    process.argv = ['node', scriptPath];
    issuesState.invalidJson = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const exitMock: typeof process.exit = ((code?: number) => {
      throw new Error(`process.exit:${code ?? 'undefined'}`);
    }) as unknown as typeof process.exit;
    process.exit = exitMock;

    vi.resetModules();
    await expect(import('@scripts/sonarcloud-issues')).rejects.toThrow(/process\.exit:1/);
  });
});
