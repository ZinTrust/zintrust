import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IncomingMessage } from '@node-singletons/http';
import { ErrorHandler } from '@proxy/ErrorHandler';
import type { ProxyBackend, ProxyResponse } from '@proxy/ProxyBackend';
import type { ProxySigningConfig } from '@proxy/ProxyConfig';
import { createProxyServer } from '@proxy/ProxyServer';
import { RequestValidator } from '@proxy/RequestValidator';
import { SigningService } from '@proxy/SigningService';

type MongoCollectionLike = Record<string, unknown>;
type MongoDatabaseLike = {
  collection: (name: string) => MongoCollectionLike;
};
type MongoClientLike = {
  connect: () => Promise<void>;
  db: (name: string) => MongoDatabaseLike;
  close: () => Promise<void>;
};

type ProxyConfig = {
  host: string;
  port: number;
  maxBodyBytes: number;
  mongoOptions: {
    uri: string;
    database: string;
  };
  signing: ProxySigningConfig;
};

type ProxyOverrides = Partial<{
  host: string;
  port: number;
  maxBodyBytes: number;
  mongoUri: string;
  mongoDb: string;
  requireSigning: boolean;
  keyId: string;
  secret: string;
  signingWindowMs: number;
}>;

const resolveProxyConfig = (
  overrides: ProxyOverrides = {}
): {
  host: string;
  port: number;
  maxBodyBytes: number;
} => {
  const host = overrides?.host ?? Env.get('MONGODB_PROXY_HOST', Env.HOST ?? '127.0.0.1');
  const port = overrides.port ?? Env.getInt('MONGODB_PROXY_PORT', Env.PORT ?? 3000);
  const maxBodyBytes =
    overrides.maxBodyBytes ?? Env.getInt('MONGODB_PROXY_MAX_BODY_BYTES', Env.MAX_BODY_SIZE ?? 0);

  return { host, port, maxBodyBytes };
};

const resolveMongoConfig = (
  overrides: ProxyOverrides = {}
): {
  uri: string;
  database: string;
} => {
  const uri = overrides.mongoUri ?? Env.get('MONGO_URI', 'mongodb://localhost:27017');
  const database = overrides.mongoDb ?? Env.get('MONGO_DB', 'zintrust');

  return { uri, database };
};

const resolveSigningConfig = (
  overrides: ProxyOverrides = {}
): {
  keyId: string;
  secret: string;
  requireSigning: boolean;
  signingWindowMs: number;
} => {
  const keyId = overrides.keyId ?? Env.get('MONGODB_PROXY_KEY_ID', '');
  const secretRaw = overrides.secret ?? Env.get('MONGODB_PROXY_SECRET', '');
  const secret = secretRaw.trim() === '' ? (Env.APP_KEY ?? '') : secretRaw;
  const requireSigningEnv = Env.MONGODB_PROXY_REQUIRE_SIGNING;
  const requireSigning = requireSigningEnv ? true : overrides.requireSigning === true;
  const signingWindowMs =
    overrides.signingWindowMs ?? Env.getInt('MONGODB_PROXY_SIGNING_WINDOW_MS', 60000);

  return { keyId, secret, requireSigning, signingWindowMs };
};

const resolveConfig = (overrides: ProxyOverrides = {}): ProxyConfig => {
  const proxyConfig = resolveProxyConfig(overrides);
  const mongoConfig = resolveMongoConfig(overrides);
  const signingConfig = resolveSigningConfig(overrides);

  return {
    host: proxyConfig.host,
    port: proxyConfig.port,
    maxBodyBytes: proxyConfig.maxBodyBytes,
    mongoOptions: mongoConfig,
    signing: {
      keyId: signingConfig.keyId,
      secret: signingConfig.secret,
      require: signingConfig.requireSigning,
      windowMs: signingConfig.signingWindowMs,
    },
  };
};

const validateOperationPayload = (
  payload: Record<string, unknown>
): {
  valid: boolean;
  operation?: string;
  collection?: string;
  args?: Record<string, unknown>;
  error?: { code: string; message: string };
} => {
  const operation = payload['operation'];
  const collection = payload['collection'];
  const args = payload['args'];

  if (typeof operation !== 'string' || operation.trim() === '') {
    return {
      valid: false,
      error: { code: 'VALIDATION_ERROR', message: 'operation is required' },
    };
  }

  if (typeof collection !== 'string' || collection.trim() === '') {
    return {
      valid: false,
      error: { code: 'VALIDATION_ERROR', message: 'collection is required' },
    };
  }

  return {
    valid: true,
    operation,
    collection,
    args: (args as Record<string, unknown>) ?? {},
  };
};

const getMongoModule = async (): Promise<{ MongoClient: new (uri: string) => MongoClientLike }> => {
  const mongoModule = (await import('mongodb')) as { MongoClient?: unknown };
  const MongoDBClient = mongoModule.MongoClient;
  if (typeof MongoDBClient !== 'function') {
    throw ErrorFactory.createDatabaseError('MongoDB driver is unavailable');
  }
  return { MongoClient: MongoDBClient as new (uri: string) => MongoClientLike };
};

const createMongoClient = async (uri: string): Promise<MongoClientLike> => {
  const { MongoClient: MongoDBClient } = await getMongoModule();
  const client = new MongoDBClient(uri);
  await client.connect();
  return client;
};

const callMethod = async (
  coll: MongoCollectionLike,
  methodName: string,
  ...params: unknown[]
): Promise<unknown> => {
  const method = (coll as unknown as Record<string, unknown>)[methodName];
  if (typeof method === 'function') {
    const result = (method as (...input: unknown[]) => unknown)(...params);
    if (result !== null && typeof result === 'object' && 'toArray' in result) {
      const toArray = (result as { toArray?: () => Promise<unknown> }).toArray;
      if (typeof toArray === 'function') {
        return toArray();
      }
    }
    return result;
  }
  throw ErrorFactory.createDatabaseError(`Method ${methodName} not found on collection`);
};

const OPERATION_HANDLERS = Object.freeze({
  find: async (coll: MongoCollectionLike, args: Record<string, unknown>) =>
    callMethod(coll, 'find', args['filter'] ?? {}),
  findOne: async (coll: MongoCollectionLike, args: Record<string, unknown>) =>
    callMethod(coll, 'findOne', args['filter'] ?? {}),
  insertOne: async (coll: MongoCollectionLike, args: Record<string, unknown>) =>
    callMethod(coll, 'insertOne', args['document'] ?? {}),
  insertMany: async (coll: MongoCollectionLike, args: Record<string, unknown>) =>
    callMethod(coll, 'insertMany', (args['documents'] as unknown[]) ?? []),
  updateOne: async (coll: MongoCollectionLike, args: Record<string, unknown>) =>
    callMethod(coll, 'updateOne', args['filter'] ?? {}, args['update'] ?? {}),
  updateMany: async (coll: MongoCollectionLike, args: Record<string, unknown>) =>
    callMethod(coll, 'updateMany', args['filter'] ?? {}, args['update'] ?? {}),
  deleteOne: async (coll: MongoCollectionLike, args: Record<string, unknown>) =>
    callMethod(coll, 'deleteOne', args['filter'] ?? {}),
  deleteMany: async (coll: MongoCollectionLike, args: Record<string, unknown>) =>
    callMethod(coll, 'deleteMany', args['filter'] ?? {}),
  countDocuments: async (coll: MongoCollectionLike, args: Record<string, unknown>) =>
    callMethod(coll, 'countDocuments', args['filter'] ?? {}),
  aggregate: async (coll: MongoCollectionLike, args: Record<string, unknown>) =>
    callMethod(coll, 'aggregate', (args['pipeline'] as unknown[]) ?? []),
} as const);

const executeOperation = async (
  client: MongoClientLike,
  dbName: string,
  collectionName: string,
  operation: string,
  args: Record<string, unknown>
): Promise<unknown> => {
  const db = client.db(dbName);
  const coll = db.collection(collectionName);

  if (Object.prototype.hasOwnProperty.call(OPERATION_HANDLERS, operation)) {
    const handler = OPERATION_HANDLERS[operation as keyof typeof OPERATION_HANDLERS];
    return handler(coll, args);
  }

  throw ErrorFactory.createDatabaseError(`Unsupported MongoDB operation: ${String(operation)}`);
};

const createBackend = (client: MongoClientLike, config: ProxyConfig): ProxyBackend => ({
  name: 'mongodb',
  handle: async (request) => {
    const methodError = RequestValidator.requirePost(request.method);
    if (methodError) {
      return {
        status: 405,
        body: { code: methodError.code, message: methodError.message },
      };
    }

    if (request.path !== '/zin/mongodb/operation') {
      return { status: 404, body: { code: 'NOT_FOUND', message: 'Unknown endpoint' } };
    }

    const parsed = RequestValidator.parseJson(request.body);
    if (!parsed.ok) {
      return { status: 400, body: { code: parsed.error.code, message: parsed.error.message } };
    }

    const validated = validateOperationPayload(parsed.value);
    if (!validated.valid) {
      return {
        status: 400,
        body: {
          code: validated.error?.code ?? 'VALIDATION_ERROR',
          message: validated.error?.message ?? 'Invalid request',
        },
      };
    }

    try {
      const result = await executeOperation(
        client,
        config.mongoOptions.database,
        validated.collection ?? '',
        validated.operation ?? '',
        validated.args ?? {}
      );

      return { status: 200, body: { success: true, result } };
    } catch (error) {
      Logger.error('MongoDB proxy operation failed', { error });
      return ErrorHandler.toProxyError(500, 'MONGODB_PROXY_ERROR', String(error));
    }
  },
  health: async (): Promise<ProxyResponse> => {
    try {
      client.db(config.mongoOptions.database);
      await Promise.resolve();
      return { status: 200, body: { status: 'ok' } };
    } catch (error) {
      await Promise.resolve();
      return { status: 503, body: { status: 'unhealthy', error: String(error) } };
    }
  },
  shutdown: async (): Promise<void> => {
    await client.close();
  },
});

const createVerifier = (
  config: ProxyConfig
): ((
  req: IncomingMessage,
  body: string
) => Promise<{ ok: true } | { ok: false; status: number; message: string }>) => {
  return async (req, body) => {
    const headers: Record<string, string | undefined> = {
      'x-zt-key-id': req.headers['x-zt-key-id'] as string | undefined,
      'x-zt-timestamp': req.headers['x-zt-timestamp'] as string | undefined,
      'x-zt-nonce': req.headers['x-zt-nonce'] as string | undefined,
      'x-zt-body-sha256': req.headers['x-zt-body-sha256'] as string | undefined,
      'x-zt-signature': req.headers['x-zt-signature'] as string | undefined,
    };

    if (!SigningService.shouldVerify(config.signing, headers)) {
      return { ok: true as const };
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const verified = await SigningService.verify({
      method: req.method ?? 'POST',
      url,
      body,
      headers,
      signing: config.signing,
    });

    if (!verified.ok) {
      return { ok: false as const, status: verified.status, message: verified.message };
    }

    return { ok: true as const };
  };
};

export const MongoDBProxyServer = Object.freeze({
  async start(overrides: ProxyOverrides = {}) {
    const config = resolveConfig(overrides);
    Logger.info(
      `Starting MongoDB proxy on ${config.host}:${config.port} → ${config.mongoOptions.uri}`
    );

    const client = await createMongoClient(config.mongoOptions.uri);
    const backend = createBackend(client, config);
    const verifier = createVerifier(config);

    const server = createProxyServer({
      host: config.host,
      port: config.port,
      maxBodyBytes: config.maxBodyBytes,
      backend,
      verify: verifier,
    });

    await server.start();
    Logger.info(`✓ MongoDB proxy listening on ${config.host}:${config.port}`);

    return {
      server,
      client,
      async close() {
        await server.stop();
        await client.close();
        Logger.info('MongoDB proxy server closed');
      },
    };
  },
});
