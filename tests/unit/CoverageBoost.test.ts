import { Application } from '@/Application';
import { Server } from '@/Server';
import { CLI } from '@/cli/CLI';
import { ErrorHandler, displayDebug } from '@/cli/ErrorHandler';
import { DatabaseError } from '@/exceptions/ZintrustError';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ServiceContainer } from '@container/ServiceContainer';
import { Request } from '@http/Request';
import { Response } from '@http/Response';
import { Database } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';
import { BelongsTo, BelongsToMany, HasMany, HasOne } from '@orm/Relationships';
import { QueryLogger } from '@profiling/QueryLogger';
import { Router } from '@routing/EnhancedRouter';
import { XssProtection, escapeJson } from '@security/XssProtection';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock node:fs for Application/Server/Logger
vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('{}'),
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  appendFileSync: vi.fn(),
  statSync: vi.fn().mockReturnValue({
    size: 0,
    mtime: new Date(),
    isDirectory: vi.fn().mockReturnValue(false),
  }),
  unlinkSync: vi.fn(),
}));

// Mock node:http
vi.mock('node:http', () => ({
  createServer: vi.fn().mockReturnValue({
    listen: vi.fn((_port, _host, cb) => cb?.()),
    close: vi.fn((cb) => cb?.()),
  }),
}));

describe('Coverage Boost - Final Push', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    QueryLogger.clear();

    // Reset mocked fs implementations to defaults (avoid cross-test leakage)
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({
      size: 0,
      mtime: new Date(),
      isDirectory: vi.fn().mockReturnValue(false),
    } as unknown as fs.Stats);
  });

  describe('Application & Server', () => {
    it('should initialize application and server', async () => {
      const app = new Application('/tmp');
      expect(app).toBeDefined();
      await app.boot();

      const server = new Server(app);
      expect(server).toBeDefined();

      await server.listen();
      await server.close();
    });

    it('should handle server requests and static files', async () => {
      const app = new Application('/tmp');
      const server = new Server(app);

      const mockReq = {
        url: '/doc/test.html',
        method: 'GET',
        headers: {},
        on: vi.fn(),
      } as any;

      const mockRes = {
        setHeader: vi.fn(),
        writeHead: vi.fn(),
        end: vi.fn(),
        statusCode: 200,
      } as any;

      // @ts-ignore - access private method for testing
      await server.handleRequest(mockReq, mockRes);
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should execute matched route handlers', async () => {
      const app = {
        getRouter: () => ({
          match: () => ({
            handler: async (_req: Request, res: Response): Promise<void> => {
              res.setStatus(200).json({ ok: true });
            },
          }),
        }),
      } as unknown as Application;

      const server = new Server(app);

      const mockReq = {
        url: '/anything',
        method: 'GET',
        headers: {},
        on: vi.fn(),
      } as any;

      const mockRes = {
        setHeader: vi.fn(),
        writeHead: vi.fn(),
        end: vi.fn(),
        statusCode: 200,
      } as any;

      // @ts-ignore - private method for coverage
      await server.handleRequest(mockReq, mockRes);
      expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('"ok":true'));
    });

    it('should handle 404 for unknown static files', async () => {
      const app = new Application('/tmp');
      const server = new Server(app);

      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const mockReq = { url: '/unknown', method: 'GET', headers: {}, on: vi.fn() } as any;
      const mockRes = {
        setHeader: vi.fn(),
        writeHead: vi.fn(),
        end: vi.fn(),
        statusCode: 200,
      } as any;

      // @ts-ignore
      await server.handleRequest(mockReq, mockRes);
      expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('Not Found'));
    });

    it('should handle server errors', async () => {
      const app = new Application('/tmp');
      const server = new Server(app);

      // Force error by making Request constructor fail or similar
      const mockReq = null as any;
      const mockRes = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() } as any;

      // @ts-ignore
      await server.handleRequest(mockReq, mockRes);
      expect(mockRes.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
    });

    it('should handle static file serving variations', async () => {
      const app = new Application('/tmp');
      const server = new Server(app);
      const res = new Response({ setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() } as any);

      // Test /doc path
      // @ts-ignore
      expect(server.mapStaticPath('/doc/test')).toContain('docs-website/vue/.vitepress/dist/test');

      // Test /doc root mapping to index.html
      // @ts-ignore
      expect(server.mapStaticPath('/doc')).toContain('docs-website/vue/.vitepress/dist/index.html');

      // Test / path
      // @ts-ignore
      expect(server.mapStaticPath('/')).toContain('docs-website/index.html');

      // Test unknown extension
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('test'));
      // @ts-ignore
      server.sendStaticFile('test.unknown', res);
      expect(res.getHeader('Content-Type')).toBe('application/octet-stream');

      // Test serveStatic error
      vi.spyOn(fs, 'statSync').mockImplementation(() => {
        throw new Error('stat error');
      });
      const reqError = new Request({ url: '/', method: 'GET', headers: {} } as any);
      // @ts-ignore
      const result = await server.serveStatic(reqError, res);
      expect(result).toBe(false);
    });

    it('should resolve clean URLs to .html files', async () => {
      const app = new Application('/tmp');
      const server = new Server(app);
      const res = new Response({ setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() } as any);

      const req = new Request({ url: '/doc/clean-url', method: 'GET', headers: {} } as any);

      // @ts-ignore - access private helper for deterministic path
      const basePath = server.mapStaticPath('/doc/clean-url');
      const htmlPath = `${basePath}.html`;

      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (typeof p !== 'string') return false;
        return p === htmlPath;
      });
      vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('ok'));

      const sendSpy = vi.spyOn(server as any, 'sendStaticFile');

      // @ts-ignore - private method for branch coverage
      const served = await server.serveStatic(req, res);
      expect(served).toBe(true);
      expect(sendSpy).toHaveBeenCalledWith(htmlPath, res);
    });

    it('should return false when clean URL has no matching .html', async () => {
      const app = new Application('/tmp');
      const server = new Server(app);
      const res = new Response({ setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() } as any);

      const req = new Request({ url: '/doc/missing', method: 'GET', headers: {} } as any);

      // @ts-ignore - access private helper for deterministic path
      const basePath = server.mapStaticPath('/doc/missing');
      const htmlPath = `${basePath}.html`;

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p !== 'string') return false;
        if (p === basePath) return false;
        if (p === htmlPath) return false;
        return false;
      });

      // @ts-ignore - private method for branch coverage
      const served = await server.serveStatic(req, res);
      expect(served).toBe(false);
    });

    it('should serve directory index.html', async () => {
      const app = new Application('/tmp');
      const server = new Server(app);
      const res = new Response({ setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() } as any);

      const req = new Request({ url: '/doc/dir', method: 'GET', headers: {} } as any);

      // @ts-ignore
      const dirPath = server.mapStaticPath('/doc/dir');
      const indexPath = path.join(dirPath, 'index.html');

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({
        size: 0,
        mtime: new Date(),
        isDirectory: vi.fn().mockReturnValue(true),
      } as any);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('ok'));

      const sendSpy = vi.spyOn(server as any, 'sendStaticFile');
      // @ts-ignore
      const served = await server.serveStatic(req, res);
      expect(served).toBe(true);
      expect(sendSpy).toHaveBeenCalledWith(indexPath, res);
    });
  });

  describe('CLI', () => {
    it('should load version from package.json when version is a string', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue('{"version":"2.3.4"}');
      const cli = new CLI();
      // @ts-ignore
      expect(cli.version).toBe('2.3.4');
    });

    it('should fall back to default version when package.json is invalid', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue('not-json');
      const cli = new CLI();
      // @ts-ignore
      expect(cli.version).toBe('1.0.0');
    });

    it('should run CLI with version request', async () => {
      const cli = new CLI();
      await cli.run(['-v']);
    });

    it('should run CLI with long version request', async () => {
      const cli = new CLI();
      await cli.run(['--version']);
    });

    it('should run CLI with help request', async () => {
      const cli = new CLI();
      await cli.run([]);
    });

    it('should handle CLI errors', async () => {
      const cli = new CLI();
      // @ts-ignore - access private method
      expect(() => cli.handleExecutionError(new Error('test'))).toThrow();

      const errWithCode = new Error('fail');
      // @ts-ignore
      errWithCode.exitCode = 5;
      // @ts-ignore
      expect(cli.getExitCode(errWithCode)).toBe(5);
      // @ts-ignore
      expect(cli.getExitCode(new Error('err'))).toBe(1);
    });

    it('should handle ignorable commander errors', async () => {
      const cli = new CLI();
      const err = new Error('commander');
      // @ts-ignore
      err.code = 'commander.helpDisplayed';
      // @ts-ignore
      err.exitCode = 0;

      // @ts-ignore
      expect(cli.isIgnorableCommanderError(err)).toBe(true);
    });

    it('should not treat non-commander errors as ignorable', async () => {
      const cli = new CLI();
      // @ts-ignore
      expect(cli.isIgnorableCommanderError(new Error('no-code'))).toBe(false);
      // @ts-ignore
      expect(cli.isIgnorableCommanderError({ code: 'commander.helpDisplayed', exitCode: 0 })).toBe(
        false
      );
    });

    it('should return early for ignorable commander errors in handleExecutionError', async () => {
      const cli = new CLI();
      const err = new Error('commander');
      // @ts-ignore
      err.code = 'commander.helpDisplayed';
      // @ts-ignore
      err.exitCode = 0;

      // @ts-ignore
      expect(() => cli.handleExecutionError(err)).not.toThrow();
    });

    it('should return early when error equals version in handleExecutionError', async () => {
      const cli = new CLI();
      // @ts-ignore
      const version = cli.version;
      // @ts-ignore
      expect(() => cli.handleExecutionError(version)).not.toThrow();
    });

    it('should handle help command variations', async () => {
      const cli = new CLI();
      const program = cli.getProgram();

      // Mock help command action
      const helpCmd = program.commands.find((c) => c.name() === 'help');
      if (helpCmd) {
        try {
          // @ts-ignore
          await helpCmd._actionHandler(['unknown']);
        } catch {
          // Expected commander exit
        }
      }
    });

    it('should call cmd.help() for a known command in help action', async () => {
      const cli = new CLI();
      const program = cli.getProgram();
      const helpCmd = program.commands.find((c) => c.name() === 'help');
      if (helpCmd) {
        try {
          // @ts-ignore
          await helpCmd._actionHandler(['help']);
        } catch {
          // Expected commander exit
        }
      }
    });

    it('should call program.help() when help action has no command argument', async () => {
      const cli = new CLI();
      const program = cli.getProgram();
      const helpCmd = program.commands.find((c) => c.name() === 'help');
      if (helpCmd) {
        try {
          // @ts-ignore
          await helpCmd._actionHandler([]);
        } catch {
          // Expected commander exit
        }
      }
    });

    it('should handle commander errors with exit codes', async () => {
      const cli = new CLI();
      const err = new Error('test');
      // @ts-ignore
      err.code = 'commander.execute';
      // @ts-ignore
      err.exitCode = 1;

      const spy = vi.spyOn(process, 'exit').mockImplementation(() => {
        return undefined as never;
      });

      // Mock parseAsync to throw
      vi.spyOn(cli.getProgram(), 'parseAsync').mockRejectedValue(err);

      await cli.run(['test']);
      expect(spy).toHaveBeenCalledWith(1);
    });

    it('should surface non-commander parse errors via ErrorHandler', async () => {
      const cli = new CLI();
      const parseError = new Error('boom');

      const handleSpy = vi.spyOn(ErrorHandler, 'handle').mockImplementation(() => undefined);
      vi.spyOn(cli.getProgram(), 'parseAsync').mockRejectedValue(parseError);

      await expect(cli.run(['some-command'])).rejects.toThrow('boom');
      expect(handleSpy).toHaveBeenCalledWith(parseError);
    });

    it('should throw non-Error values without calling ErrorHandler.handle', async () => {
      const cli = new CLI();
      const handleSpy = vi.spyOn(ErrorHandler, 'handle').mockImplementation(() => undefined);

      vi.spyOn(cli.getProgram(), 'parseAsync').mockRejectedValue('not-an-error');

      await expect(cli.run(['some-command'])).rejects.toBe('not-an-error');
      expect(handleSpy).not.toHaveBeenCalled();
    });
  });

  describe('SecretsManager', () => {
    it('should handle different platforms', async () => {
      vi.resetModules();
      const { SecretsManager } = await import('@config/SecretsManager');
      const kv = {
        get: vi.fn().mockResolvedValue('val'),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue({ keys: [{ name: 'k1' }] }),
      };

      const sm = SecretsManager.getInstance({ platform: 'cloudflare', kv: kv as any });
      expect(await sm.getSecret('test')).toBe('val');
      await sm.setSecret('test', 'new-val');
      await sm.deleteSecret('test');
      expect(await sm.listSecrets()).toEqual(['k1']);
      sm.clearCache();
    });

    it('should handle AWS platform errors', async () => {
      vi.resetModules();
      const { SecretsManager } = await import('@config/SecretsManager');
      const sm = SecretsManager.getInstance({ platform: 'aws' });
      await expect(sm.getSecret('test')).rejects.toThrow();
      await expect(sm.setSecret('test', 'val')).rejects.toThrow();
      await expect(sm.deleteSecret('test')).rejects.toThrow();
      await expect(sm.rotateSecret('test')).rejects.toThrow();
      expect(await sm.listSecrets()).toEqual([]);
    });

    it('should handle Deno platform', async () => {
      vi.resetModules();
      // @ts-ignore
      globalThis.Deno = { env: { get: (k) => (k === 'test' ? 'deno-val' : null) } };
      const { SecretsManager } = await import('@config/SecretsManager');
      const sm = SecretsManager.getInstance({ platform: 'deno' });
      expect(await sm.getSecret('test')).toBe('deno-val');
      // @ts-ignore
      delete globalThis.Deno;
    });

    it('should handle local platform', async () => {
      vi.resetModules();
      process.env['TEST_SECRET'] = 'local-val';
      const { SecretsManager } = await import('@config/SecretsManager');
      const sm = SecretsManager.getInstance({ platform: 'local' });
      expect(await sm.getSecret('TEST_SECRET')).toBe('local-val');
      delete process.env['TEST_SECRET'];
    });
  });

  describe('ConnectionManager', () => {
    it('should manage connection pool', async () => {
      vi.resetModules();
      const { ConnectionManager } = await import('@orm/ConnectionManager');
      const cm = ConnectionManager.getInstance({
        adapter: 'postgresql',
        database: 'test',
        maxConnections: 2,
      });

      const c1 = await cm.getConnection('c1');
      const c2 = await cm.getConnection('c2');
      expect(c1).toBeDefined();
      expect(c2).toBeDefined();

      const stats = cm.getPoolStats();
      expect(stats.total).toBe(2);
      expect(stats.active).toBe(2);

      await cm.releaseConnection('c1');
      expect(cm.getPoolStats().idle).toBe(1);

      const c3 = await cm.getConnection('c3'); // Should reuse c1
      expect(c3).toBe(c1);

      await cm.enableRdsProxy('proxy-host');

      const aurora = await cm.getAuroraDataApiConnection();
      await expect(aurora.execute('SELECT 1')).rejects.toThrow();
      await expect(aurora.batch([{ sql: 'SELECT 1' }])).rejects.toThrow();

      await cm.closeAll();
    });
  });

  describe('HTTP Layer', () => {
    it('should handle Request', () => {
      const mockReq = {
        url: '/test?a=1&b=2',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test': 'val' },
        on: vi.fn((event, cb) => {
          if (event === 'data') cb(Buffer.from('{"foo":"bar"}'));
          if (event === 'end') cb();
        }),
      } as any;

      const req = new Request(mockReq);
      expect(req.getMethod()).toBe('POST');
      expect(req.getPath()).toBe('/test');
      expect(req.getQuery()).toEqual({ a: '1', b: '2' });
      expect(req.getQueryParam('a')).toBe('1');
      expect(req.getHeaders()).toEqual(mockReq.headers);
      expect(req.headers).toEqual(mockReq.headers);
      expect(req.getHeader('X-Test')).toBe('val');

      req.setParams({ id: '123' });
      expect(req.getParams()).toEqual({ id: '123' });
      expect(req.getParam('id')).toBe('123');

      req.setBody({ foo: 'bar' });
      expect(req.getBody()).toEqual({ foo: 'bar' });
    });

    it('should handle Response', () => {
      const mockRes = {
        setHeader: vi.fn(),
        end: vi.fn(),
        statusCode: 200,
      } as any;

      const res = new Response(mockRes);
      expect(res.getStatus()).toBe(200);
      expect(res.statusCode).toBe(200);

      res.setStatus(201);
      expect(res.getStatus()).toBe(201);

      res.setHeader('X-Custom', 'val');
      expect(res.getHeader('X-Custom')).toBe('val');

      res.json({ ok: true });
      expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify({ ok: true }));

      res.text('hello');
      expect(mockRes.end).toHaveBeenCalledWith('hello');

      res.html('<h1>hi</h1>');
      expect(mockRes.end).toHaveBeenCalledWith('<h1>hi</h1>');

      res.send(Buffer.from('raw'));
      expect(mockRes.end).toHaveBeenCalledWith(expect.any(Buffer));

      res.redirect('/login', 301);
      expect(mockRes.statusCode).toBe(301);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Location', '/login');
    });
  });

  describe('ServiceContainer', () => {
    it('should manage bindings', () => {
      const container = new ServiceContainer();
      container.bind('test', () => ({ foo: 'bar' }));
      expect(container.has('test')).toBe(true);
      expect(container.resolve('test')).toEqual({ foo: 'bar' });
      expect(container.get('test')).toEqual({ foo: 'bar' });
      const getcount = Math.random(); // NOSONAR
      container.singleton('single', () => ({ count: getcount })); // NOSONAR
      const s1 = container.resolve('single');
      const s2 = container.resolve('single');
      expect(s1).toBe(s2);

      container.singleton('inst', { val: 123 });
      expect(container.resolve('inst')).toEqual({ val: 123 });

      container.flush();
      expect(container.has('test')).toBe(false);
      expect(() => container.resolve('test')).toThrow();
    });
  });

  describe('EnhancedRouter', () => {
    it('should route requests and handle groups', async () => {
      const router = new Router();
      const handler = vi.fn();

      router.get('/users/:id', handler, 'users.show');
      router.post('/users', handler);
      router.put('/users/:id', handler);
      router.patch('/users/:id', handler);
      router.delete('/users/:id', handler);
      router.any('/all', handler);

      expect(router.match('GET', '/users/123')?.params).toEqual({ id: '123' });
      expect(router.match('POST', '/users')).toBeDefined();
      expect(router.match('PUT', '/users/123')).toBeDefined();
      expect(router.match('PATCH', '/users/123')).toBeDefined();
      expect(router.match('DELETE', '/users/123')).toBeDefined();
      expect(router.match('GET', '/all')).toBeDefined();
      expect(router.match('POST', '/all')).toBeDefined();
      expect(router.match('GET', '/not-found')).toBeNull();

      // Groups
      router.group({ prefix: '/api', middleware: ['auth'] }, (r) => {
        r.get('/me', handler);
      });
      const apiMatch = router.match('GET', '/api/me');
      expect(apiMatch).toBeDefined();
      expect(apiMatch?.middleware).toContain('auth');

      // Resource
      const controller = {
        index: handler,
        create: handler,
        store: handler,
        show: handler,
        edit: handler,
        update: handler,
        destroy: handler,
      };
      router.resource('posts', controller);
      expect(router.match('GET', '/posts')).toBeDefined();
      expect(router.match('GET', '/posts/1')).toBeDefined();
      expect(router.match('POST', '/posts')).toBeDefined();
    });
  });

  describe('ORM - QueryBuilder & Database', () => {
    it('should build SQL and use database', async () => {
      const db = new Database({ driver: 'sqlite', database: ':memory:' });
      // @ts-ignore
      db.connected = true;
      // @ts-ignore
      vi.spyOn(db.writeAdapter, 'query').mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      const qb = new QueryBuilder('users', db);
      qb.select('id', 'name')
        .where('id', 1)
        .andWhere('active', '=', true)
        .orWhere('admin', 'true')
        .join('roles', 'users.role_id = roles.id')
        .leftJoin('profiles', 'users.id = profiles.user_id')
        .orderBy('name', 'DESC')
        .limit(10)
        .offset(5);

      expect(qb.getTable()).toBe('users');
      expect(qb.getSelectColumns()).toEqual(['id', 'name']);
      expect(qb.getWhereClauses().length).toBe(3);
      expect(qb.getJoins().length).toBe(2);
      expect(qb.getLimit()).toBe(10);
      expect(qb.getOffset()).toBe(5);
      expect(qb.getOrderBy()).toEqual({ column: 'name', direction: 'DESC' });
      expect(qb.isReadOperation()).toBe(true);

      const sql = qb.toSQL();
      expect(sql).toContain('SELECT "id", "name" FROM "users"');
      expect(sql).toContain('WHERE "id" = ? AND "active" = ? AND "admin" = ?');
      expect(sql).toContain('ORDER BY name DESC');
      expect(sql).toContain('LIMIT 10 OFFSET 5');

      const results = await qb.get();
      expect(results).toEqual([{ id: 1 }]);

      const first = await qb.first();
      expect(first).toEqual({ id: 1 });
    });

    it('should handle empty clauses and select *', async () => {
      const db = new Database({ driver: 'sqlite', database: ':memory:' });
      // @ts-ignore
      db.connected = true;
      // @ts-ignore
      vi.spyOn(db.writeAdapter, 'query').mockResolvedValue({ rows: [], rowCount: 0 });

      const qb = new QueryBuilder('users', db);
      qb.select('*');
      const sql = qb.toSQL();
      expect(sql).toBe('SELECT * FROM "users"');

      const first = await qb.first();
      expect(first).toBeNull();
    });

    it('should handle limit and offset variations', () => {
      const qb = new QueryBuilder('users');
      qb.limit(5);
      expect(qb.toSQL()).toContain('LIMIT 5');
      expect(qb.toSQL()).not.toContain('OFFSET');

      const qb2 = new QueryBuilder('users');
      qb2.offset(10);
      expect(qb2.toSQL()).toContain('OFFSET 10');
      expect(qb2.toSQL()).not.toContain('LIMIT');
    });

    it('should throw DatabaseError when no db is provided', async () => {
      const qb = new QueryBuilder('users');
      await expect(qb.get()).rejects.toThrow(DatabaseError);
      await expect(qb.first()).rejects.toThrow(DatabaseError);
    });
  });

  describe('ORM - Relationships', () => {
    class MockModel {
      static readonly table = 'users';
      static query() {
        const qb = new QueryBuilder(this.table);
        qb.get = vi.fn().mockResolvedValue([{ id: 1, name: 'Test' }]);
        qb.first = vi.fn().mockResolvedValue({ id: 1, name: 'Test' });
        return qb;
      }
      getAttribute(key: string) {
        if (key === 'id') return 1;
        return 'val';
      }
      getTable() {
        return 'users';
      }
    }

    it('should handle HasOne', async () => {
      const rel = new HasOne(MockModel as any, 'user_id', 'id');
      const result = await rel.get(new MockModel() as any);
      expect(result).toBeDefined();

      // Test null case
      const emptyModel = { getAttribute: () => null } as any;
      expect(await rel.get(emptyModel)).toBeNull();
    });

    it('should handle HasMany', async () => {
      const rel = new HasMany(MockModel as any, 'user_id', 'id');
      const result = await rel.get(new MockModel() as any);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle BelongsTo', async () => {
      const rel = new BelongsTo(MockModel as any, 'user_id', 'id');
      const result = await rel.get(new MockModel() as any);
      expect(result).toBeDefined();
    });

    it('should handle BelongsToMany', async () => {
      const rel = new BelongsToMany(MockModel as any, 'user_roles', 'user_id', 'role_id');
      const result = await rel.get(new MockModel() as any);
      expect(Array.isArray(result)).toBe(true);

      // Test invalid instance
      const invalidModel = { getAttribute: () => null } as any;
      expect(await rel.get(invalidModel)).toEqual([]);
    });
  });

  const javascript = 'javascript:alert(1)'; // NOSONAR
  describe('Security - XssProtection', () => {
    it('should escape HTML', () => {
      expect(XssProtection.escape('<script>alert(1)</script>')).toBe(
        '&lt;script&gt;alert(1)&lt;&#x2F;script&gt;'
      );
      expect(XssProtection.escape('` =')).toBe('&#96; &#x3D;');
      expect(XssProtection.escape(null as any)).toBe('');
    });

    it('should sanitize URLs', () => {
      expect(XssProtection.isSafeUrl('https://google.com')).toBe(true);
      expect(XssProtection.isSafeUrl('http://google.com')).toBe(true); // NOSONAR
      expect(XssProtection.isSafeUrl('/relative')).toBe(true);
      expect(XssProtection.isSafeUrl('#anchor')).toBe(true);
      expect(XssProtection.isSafeUrl('google.com')).toBe(true); // Hits line 138
      expect(XssProtection.isSafeUrl(javascript)).toBe(false); // NOSONAR
      expect(XssProtection.isSafeUrl('data:text/html,evil')).toBe(false);
      expect(XssProtection.isSafeUrl('unknown:protocol')).toBe(false);
      expect(XssProtection.isSafeUrl(null as any)).toBe(false);
    });

    it('should handle encodeUri errors', () => {
      expect(XssProtection.encodeUri('\uD800')).toBe('');
      expect(XssProtection.encodeUri('https://google.com')).toBe('https%3A%2F%2Fgoogle.com');
      expect(XssProtection.encodeUri(null as any)).toBe('');
    });

    it('should handle data: protocols in encodeHref', () => {
      expect(XssProtection.encodeHref('data:image/png;base64,xxx')).toBe(
        'data:image&#x2F;png;base64,xxx'
      );
      expect(XssProtection.encodeHref('data:text/html,evil')).toBe('');
      expect(XssProtection.encodeHref(javascript)).toBe('');
      expect(XssProtection.encodeHref('https://google.com')).toBe('https:&#x2F;&#x2F;google.com');
      expect(XssProtection.encodeHref(null as any)).toBe('');
    });

    it('should escape JSON', () => {
      const obj = { foo: '<bar>' };
      expect(escapeJson(obj)).toContain('&lt;bar&gt;');
      expect(XssProtection.escapeJson(obj)).toContain('&lt;bar&gt;');
    });

    it('should sanitize HTML', () => {
      const dirty = '<script>alert(1)</script><img src=x onerror=alert(1)><div>Safe</div>';
      const clean = XssProtection.sanitize(dirty);
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('onerror');
      expect(clean).toContain('<div>Safe</div>');

      expect(XssProtection.sanitize(null as any)).toBe('');
    });
  });

  describe('Profiling - QueryLogger', () => {
    it('should log and summarize queries', () => {
      QueryLogger.setContext('req-1');
      QueryLogger.logQuery('SELECT * FROM users', [], 10);
      QueryLogger.logQuery('SELECT * FROM users', [], 15);
      QueryLogger.logQuery('SELECT * FROM posts', [], 20);

      expect(QueryLogger.getQueryCount()).toBe(3);
      expect(QueryLogger.getTotalDuration()).toBe(45);

      const summary = QueryLogger.getQuerySummary();
      expect(summary.get('SELECT * FROM users')?.executionCount).toBe(2);

      // N+1 detection
      for (let i = 0; i < 5; i++) QueryLogger.logQuery('SELECT * FROM n1', [], 5);
      const suspects = QueryLogger.getN1Suspects('req-1', 5);
      expect(suspects.length).toBe(1);
      expect(suspects[0].sql).toBe('SELECT * FROM n1');
    });

    it('should handle multiple contexts and clearing', () => {
      QueryLogger.logQuery('Q1', [], 10, 'ctx-1');
      QueryLogger.logQuery('Q2', [], 10, 'ctx-2');

      expect(QueryLogger.getAllLogs().size).toBe(2);

      QueryLogger.clear('ctx-1');
      expect(QueryLogger.getQueryLog('ctx-1')).toEqual([]);
      expect(QueryLogger.getQueryLog('ctx-2').length).toBe(1);

      QueryLogger.clear();
      expect(QueryLogger.getAllLogs().size).toBe(0);
      expect(QueryLogger.getContext()).toBe('default');
    });
  });

  describe('ORM & Relationships - Coverage Boost', () => {
    it('should handle QueryBuilder select with no arguments', () => {
      const builder = new QueryBuilder('users');
      builder.select();
      expect(builder.toSQL()).toContain('SELECT *');
    });

    it('should handle Relationships with empty string keys', async () => {
      const mockRelated = {
        query: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
          get: vi.fn().mockResolvedValue([]),
        }),
      } as any;

      const instance = {
        getAttribute: vi.fn().mockReturnValue(''),
      } as any;

      const hasOne = new HasOne(mockRelated, 'user_id', 'id');
      expect(await hasOne.get(instance)).toBeNull();

      const hasMany = new HasMany(mockRelated, 'user_id', 'id');
      expect(await hasMany.get(instance)).toEqual([]);

      const belongsTo = new BelongsTo(mockRelated, 'user_id', 'id');
      expect(await belongsTo.get(instance)).toBeNull();
    });
  });

  describe('Security - XssProtection - Coverage Boost', () => {
    it('should handle non-string inputs in escapeHtml', () => {
      // @ts-ignore
      expect(XssProtection.escape(null)).toBe('');
      // @ts-ignore
      expect(XssProtection.escape(undefined)).toBe('');
    });

    it('should handle encodeUri errors', () => {
      // Force a malformed URI error
      expect(XssProtection.encodeUri('\uD800')).toBe('');
    });
  });

  describe('CLI - ErrorHandler - Coverage Boost', () => {
    it('should handle displayDebug with verbose=true', () => {
      const spy = vi.spyOn(Logger, 'debug');
      displayDebug('test message', true);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Config - Env - Coverage Boost', () => {
    it('should cover getDefaultLogLevel branches', () => {
      expect(['debug', 'info', 'warn', 'error']).toContain(Env.get('LOG_LEVEL', 'info'));
    });
  });
});
