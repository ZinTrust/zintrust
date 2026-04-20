import { SystemTraceBridge } from '@/trace/SystemTraceBridge';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isFunction, isNonEmptyString, isObject } from '@helper/index';
import type { IRequest } from '@http/Request';
import {
  detectRuntimePlatform,
  RuntimeServices,
  type RuntimeCrypto,
} from '@runtime/RuntimeServices';
import {
  BulletproofDeviceStore,
  type BulletproofDeviceRecord,
} from '@security/BulletproofDeviceStore';
import { JwtManager, type JwtPayload } from '@security/JwtManager';

export type LoginFlowStage = 'identify' | 'verify' | 'issue' | 'audit';

export type LoginFlowError = Error & {
  stage: LoginFlowStage;
  details?: unknown;
};

export type LoginFlowIdentity = Record<string, unknown> | null;

export type LoginFlowVerifiedRecord = {
  user?: unknown;
  subject?: string;
  claims?: JwtPayload;
  metadata?: Record<string, unknown>;
};

export type LoginFlowResult = {
  identity: LoginFlowIdentity;
  verified: LoginFlowVerifiedRecord;
  issued?: unknown;
};

export type LoginFlowProvider<TContext = unknown> = {
  identify: (input: unknown, context: TContext) => Promise<LoginFlowIdentity>;
  verify: (
    identity: LoginFlowIdentity,
    input: unknown,
    context: TContext
  ) => Promise<LoginFlowVerifiedRecord>;
};

export type LoginFlowIssuerInput<TContext = unknown> = {
  verified: LoginFlowVerifiedRecord;
  context: TContext;
};

export type BulletproofJwtIssued = Readonly<{
  token: string;
  token_type: 'Bearer';
  deviceId: string;
  deviceSecret: string;
}>;

export type LoginFlowIssuer<TContext = unknown> = (
  input: LoginFlowIssuerInput<TContext>
) => Promise<unknown>;

export type LoginFlowAuditEvent<TContext = unknown> = {
  status: 'success' | 'failed';
  stage?: LoginFlowStage;
  provider: string;
  issuer?: string;
  identity?: LoginFlowIdentity;
  verified?: LoginFlowVerifiedRecord;
  issued?: unknown;
  error?: unknown;
  context: TContext;
};

export type LoginFlowAuditor<TContext = unknown> = (
  event: LoginFlowAuditEvent<TContext>
) => void | Promise<void>;

export type LoginFlowCreateOptions<TContext = unknown> = {
  provider: string | LoginFlowProvider<TContext>;
  context: TContext;
};

export type LoginFlowBuilder<TContext = unknown> = {
  identify: (input: unknown) => LoginFlowBuilder<TContext>;
  verify: (input: unknown) => LoginFlowBuilder<TContext>;
  issue: (issuer: string | LoginFlowIssuer<TContext>) => LoginFlowBuilder<TContext>;
  audit: (auditor?: string | LoginFlowAuditor<TContext>) => LoginFlowBuilder<TContext>;
  run: () => Promise<LoginFlowResult>;
};

export type LoginFlowNamespace = {
  create: <TContext = unknown>(
    options: LoginFlowCreateOptions<TContext>
  ) => LoginFlowBuilder<TContext>;
  registerProvider: <TContext = unknown>(
    name: string,
    provider: LoginFlowProvider<TContext>
  ) => void;
  unregisterProvider: (name: string) => void;
  hasProvider: (name: string) => boolean;
  registerIssuer: <TContext = unknown>(name: string, issuer: LoginFlowIssuer<TContext>) => void;
  unregisterIssuer: (name: string) => void;
  hasIssuer: (name: string) => boolean;
  registerAuditor: <TContext = unknown>(name: string, auditor: LoginFlowAuditor<TContext>) => void;
  unregisterAuditor: (name: string) => void;
  hasAuditor: (name: string) => boolean;
  clearRegistrations: () => void;
};

const providerRegistry = new Map<string, LoginFlowProvider<unknown>>();
const issuerRegistry = new Map<string, LoginFlowIssuer<unknown>>();
const auditorRegistry = new Map<string, LoginFlowAuditor<unknown>>();

const createLoginFlowError = (
  stage: LoginFlowStage,
  message: string,
  details?: unknown
): LoginFlowError => {
  return Object.assign(ErrorFactory.createValidationError(message, details), {
    stage,
    details,
  }) as LoginFlowError;
};

const isLoginFlowError = (value: unknown): value is LoginFlowError => {
  if (!isObject(value)) {
    return false;
  }

  return isNonEmptyString(value['stage']);
};

const getNamedProvider = <TContext>(name: string): LoginFlowProvider<TContext> => {
  const provider = providerRegistry.get(name);
  if (!provider) {
    throw createLoginFlowError('identify', `LoginFlow provider "${name}" is not registered`, {
      provider: name,
    });
  }

  return provider as LoginFlowProvider<TContext>;
};

const getNamedIssuer = <TContext>(name: string): LoginFlowIssuer<TContext> => {
  const issuer = issuerRegistry.get(name);
  if (!issuer) {
    throw createLoginFlowError('issue', `LoginFlow issuer "${name}" is not registered`, {
      issuer: name,
    });
  }

  return issuer as LoginFlowIssuer<TContext>;
};

const getNamedAuditor = <TContext>(name: string): LoginFlowAuditor<TContext> => {
  const auditor = auditorRegistry.get(name);
  if (!auditor) {
    throw createLoginFlowError('audit', `LoginFlow auditor "${name}" is not registered`, {
      auditor: name,
    });
  }

  return auditor as LoginFlowAuditor<TContext>;
};

const resolveProvider = <TContext>(
  provider: string | LoginFlowProvider<TContext>
): LoginFlowProvider<TContext> => {
  if (typeof provider === 'string') {
    return getNamedProvider<TContext>(provider);
  }

  return provider;
};

const resolveProviderName = <TContext>(provider: string | LoginFlowProvider<TContext>): string => {
  if (typeof provider === 'string') {
    return provider;
  }

  return 'inline';
};

const resolveIssuer = <TContext>(
  issuer: string | LoginFlowIssuer<TContext>
): LoginFlowIssuer<TContext> => {
  if (typeof issuer === 'string') {
    return getNamedIssuer<TContext>(issuer);
  }

  return issuer;
};

const resolveIssuerName = <TContext>(issuer: string | LoginFlowIssuer<TContext>): string => {
  if (typeof issuer === 'string') {
    return issuer;
  }

  return 'inline';
};

const resolveAuditor = <TContext>(
  auditor: string | LoginFlowAuditor<TContext>
): LoginFlowAuditor<TContext> => {
  if (typeof auditor === 'string') {
    return getNamedAuditor<TContext>(auditor);
  }

  return auditor;
};

const normalizeVerifiedRecord = (value: unknown): LoginFlowVerifiedRecord => {
  if (!isObject(value)) {
    throw createLoginFlowError('verify', 'LoginFlow verify() must return an object', { value });
  }

  const record = value as LoginFlowVerifiedRecord;
  if (record.subject !== undefined && !isNonEmptyString(record.subject)) {
    throw createLoginFlowError('verify', 'LoginFlow verify() returned an invalid subject', {
      subject: record.subject,
    });
  }

  if (record.claims !== undefined && !isObject(record.claims)) {
    throw createLoginFlowError('verify', 'LoginFlow verify() returned invalid claims', {
      claims: record.claims,
    });
  }

  return record;
};

const createJwtIssuer = async <TContext>({
  verified,
}: LoginFlowIssuerInput<TContext>): Promise<unknown> => {
  const claims = isObject(verified.claims) ? { ...verified.claims } : {};
  if (isNonEmptyString(verified.subject) && !isNonEmptyString(claims.sub)) {
    claims.sub = verified.subject;
  }

  return JwtManager.signAccessToken(claims);
};

const getContextRecord = (context: unknown): Record<string, unknown> => {
  return isObject(context) ? context : {};
};

const getContextRequest = (context: unknown): IRequest | undefined => {
  const request = getContextRecord(context)['request'];
  return isObject(request) ? (request as unknown as IRequest) : undefined;
};

const getContextString = (context: unknown, key: string): string | undefined => {
  const value = getContextRecord(context)[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
};

const getBodyString = (request: IRequest | undefined, key: string): string | undefined => {
  if (request === undefined || typeof request.getBody !== 'function') return undefined;

  const body = request.getBody();
  if (!isObject(body)) return undefined;

  const value = body[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
};

const getRequestHeaderString = (
  request: IRequest | undefined,
  name: string
): string | undefined => {
  if (request === undefined || typeof request.getHeader !== 'function') return undefined;

  const value = request.getHeader(name);
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' && value[0].trim() !== '' ? value[0].trim() : undefined;
  }

  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
};

const bytesToHex = (bytes: Uint8Array): string => {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
};

const getRuntimeCrypto = (): RuntimeCrypto =>
  RuntimeServices.create(detectRuntimePlatform()).crypto;

const generateDeviceId = (): string => {
  const bytes = getRuntimeCrypto().getRandomValues(new Uint8Array(16));
  return `dev_${bytesToHex(bytes)}`;
};

const generateDeviceSecret = (): string => {
  const bytes = getRuntimeCrypto().getRandomValues(new Uint8Array(32));
  return `hex:${bytesToHex(bytes)}`;
};

const getClaimedDeviceId = (claims: Record<string, unknown>): string | undefined => {
  const deviceId = claims['deviceId'];
  return typeof deviceId === 'string' && deviceId.trim() !== '' ? deviceId.trim() : undefined;
};

const resolveBulletproofDeviceId = (
  context: unknown,
  request: IRequest | undefined,
  claims: Record<string, unknown>
): string => {
  return (
    getContextString(context, 'deviceId') ??
    getBodyString(request, 'deviceId') ??
    getClaimedDeviceId(claims) ??
    generateDeviceId()
  );
};

const resolveBulletproofUserId = (
  context: unknown,
  verified: LoginFlowVerifiedRecord
): string | undefined => {
  const subjectUserId = isNonEmptyString(verified.subject) ? verified.subject.trim() : undefined;
  const verifiedUserId =
    isObject(verified.user) && verified.user['id'] !== undefined
      ? String(verified.user['id'])
      : undefined;

  return getContextString(context, 'userId') ?? subjectUserId ?? verifiedUserId;
};

const buildBulletproofDeviceRecord = (
  context: unknown,
  verified: LoginFlowVerifiedRecord,
  request: IRequest | undefined,
  claims: Record<string, unknown>,
  deviceSecret: string
): Readonly<{ deviceId: string; record: BulletproofDeviceRecord }> => {
  const deviceId = resolveBulletproofDeviceId(context, request, claims);
  const userId = resolveBulletproofUserId(context, verified);
  const userAgent = getRequestHeaderString(request, 'user-agent');

  return {
    deviceId,
    record: {
      deviceId,
      signingSecret: deviceSecret,
      lastSeenAt: new Date(),
      ...(isNonEmptyString(userId) ? { userId } : {}),
      ...(userAgent === undefined ? {} : { userAgent }),
    },
  };
};

const createBulletproofIssuer = async <TContext>({
  verified,
  context,
}: LoginFlowIssuerInput<TContext>): Promise<BulletproofJwtIssued> => {
  const claims = isObject(verified.claims) ? { ...verified.claims } : {};
  if (isNonEmptyString(verified.subject) && !isNonEmptyString(claims.sub)) {
    claims.sub = verified.subject;
  }

  const request = getContextRequest(context);
  const deviceSecret = generateDeviceSecret();
  const { deviceId, record } = buildBulletproofDeviceRecord(
    context,
    verified,
    request,
    claims,
    deviceSecret
  );
  claims['deviceId'] = deviceId;

  await BulletproofDeviceStore.upsert(record);

  const token = await JwtManager.signAccessToken(claims);

  return Object.freeze({
    token,
    token_type: 'Bearer',
    deviceId,
    deviceSecret,
  });
};

const createTraceAuditor = <TContext>(event: LoginFlowAuditEvent<TContext>): void => {
  const subject =
    typeof event.verified?.subject === 'string' && event.verified.subject.trim() !== ''
      ? event.verified.subject
      : undefined;

  SystemTraceBridge.emitAuth(event.status === 'success' ? 'login' : 'failed', subject);
};

const ensureNamedRegistration = (kind: 'provider' | 'issuer' | 'auditor', name: string): void => {
  if (!isNonEmptyString(name)) {
    throw createLoginFlowError('identify', `LoginFlow ${kind} name must be a non-empty string`, {
      name,
      kind,
    });
  }
};

const ensureProvider = (provider: unknown): void => {
  if (!isObject(provider) || !isFunction(provider['identify']) || !isFunction(provider['verify'])) {
    throw createLoginFlowError(
      'identify',
      'LoginFlow provider must expose identify() and verify()',
      {
        provider,
      }
    );
  }
};

const ensureHandler = (
  stage: LoginFlowStage,
  kind: 'issuer' | 'auditor',
  handler: unknown
): void => {
  if (!isFunction(handler)) {
    throw createLoginFlowError(stage, `LoginFlow ${kind} must be a function`, {
      handler,
    });
  }
};

const auditFailureIfNeeded = async <TContext>(
  auditorTarget: string | LoginFlowAuditor<TContext> | undefined,
  event: LoginFlowAuditEvent<TContext>
): Promise<void> => {
  if (auditorTarget === undefined) {
    return;
  }

  const auditor = resolveAuditor(auditorTarget);
  await auditor(event);
};

type LoginFlowState<TContext> = {
  options: LoginFlowCreateOptions<TContext>;
  providerName: string;
  identifyInput: unknown;
  verifyInput: unknown;
  issueTarget?: string | LoginFlowIssuer<TContext>;
  issueName?: string;
  auditorTarget?: string | LoginFlowAuditor<TContext>;
  identifySet: boolean;
  verifySet: boolean;
};

const ensureRequiredInputs = <TContext>(state: LoginFlowState<TContext>): void => {
  if (!state.identifySet) {
    throw createLoginFlowError('identify', 'LoginFlow identify() must be called before run()', {
      provider: state.providerName,
    });
  }

  if (!state.verifySet) {
    throw createLoginFlowError('verify', 'LoginFlow verify() must be called before run()', {
      provider: state.providerName,
    });
  }
};

const resolveProviderWithAudit = async <TContext>(
  state: LoginFlowState<TContext>
): Promise<LoginFlowProvider<TContext>> => {
  try {
    return resolveProvider(state.options.provider);
  } catch (error) {
    const wrapped = isLoginFlowError(error)
      ? error
      : createLoginFlowError('identify', 'LoginFlow identify() failed', {
          provider: state.providerName,
          error,
        });

    await auditFailureIfNeeded(state.auditorTarget, {
      status: 'failed',
      stage: 'identify',
      provider: state.providerName,
      context: state.options.context,
      error: wrapped,
    });

    throw wrapped;
  }
};

const identifyWithAudit = async <TContext>(
  state: LoginFlowState<TContext>,
  provider: LoginFlowProvider<TContext>
): Promise<LoginFlowIdentity> => {
  try {
    return await provider.identify(state.identifyInput, state.options.context);
  } catch (error) {
    const wrapped = createLoginFlowError('identify', 'LoginFlow identify() failed', {
      provider: state.providerName,
      error,
    });

    await auditFailureIfNeeded(state.auditorTarget, {
      status: 'failed',
      stage: 'identify',
      provider: state.providerName,
      context: state.options.context,
      error: wrapped,
    });

    throw wrapped;
  }
};

const verifyWithAudit = async <TContext>(
  state: LoginFlowState<TContext>,
  provider: LoginFlowProvider<TContext>,
  identity: LoginFlowIdentity
): Promise<LoginFlowVerifiedRecord> => {
  try {
    return normalizeVerifiedRecord(
      await provider.verify(identity, state.verifyInput, state.options.context)
    );
  } catch (error) {
    const wrapped = isLoginFlowError(error)
      ? error
      : createLoginFlowError('verify', 'LoginFlow verify() failed', {
          provider: state.providerName,
          error,
        });

    await auditFailureIfNeeded(state.auditorTarget, {
      status: 'failed',
      stage: 'verify',
      provider: state.providerName,
      identity,
      context: state.options.context,
      error: wrapped,
    });

    throw wrapped;
  }
};

const issueWithAudit = async <TContext>(
  state: LoginFlowState<TContext>,
  identity: LoginFlowIdentity,
  verified: LoginFlowVerifiedRecord
): Promise<unknown> => {
  if (state.issueTarget === undefined) {
    return undefined;
  }

  const issuer = resolveIssuer(state.issueTarget);

  try {
    return await issuer({ verified, context: state.options.context });
  } catch (error) {
    const wrapped = createLoginFlowError('issue', 'LoginFlow issue() failed', {
      provider: state.providerName,
      issuer: state.issueName,
      error,
    });

    await auditFailureIfNeeded(state.auditorTarget, {
      status: 'failed',
      stage: 'issue',
      provider: state.providerName,
      issuer: state.issueName,
      identity,
      verified,
      context: state.options.context,
      error: wrapped,
    });

    throw wrapped;
  }
};

const auditSuccess = async <TContext>(
  state: LoginFlowState<TContext>,
  identity: LoginFlowIdentity,
  verified: LoginFlowVerifiedRecord,
  issued: unknown
): Promise<void> => {
  if (state.auditorTarget === undefined) {
    return;
  }

  const auditor = resolveAuditor(state.auditorTarget);
  await auditor({
    status: 'success',
    provider: state.providerName,
    issuer: state.issueName,
    identity,
    verified,
    issued,
    context: state.options.context,
  });
};

const runLoginFlow = async <TContext>(
  state: LoginFlowState<TContext>
): Promise<LoginFlowResult> => {
  const provider = await resolveProviderWithAudit(state);
  ensureRequiredInputs(state);

  const identity = await identifyWithAudit(state, provider);
  const verified = await verifyWithAudit(state, provider, identity);
  const issued = await issueWithAudit(state, identity, verified);
  await auditSuccess(state, identity, verified, issued);

  return {
    identity,
    verified,
    ...(issued === undefined ? {} : { issued }),
  };
};

const createBuilder = <TContext>(state: LoginFlowState<TContext>): LoginFlowBuilder<TContext> => {
  return Object.freeze({
    identify(input: unknown): LoginFlowBuilder<TContext> {
      state.identifyInput = input;
      state.identifySet = true;
      return this;
    },
    verify(input: unknown): LoginFlowBuilder<TContext> {
      state.verifyInput = input;
      state.verifySet = true;
      return this;
    },
    issue(issuer: string | LoginFlowIssuer<TContext>): LoginFlowBuilder<TContext> {
      state.issueTarget = issuer;
      state.issueName = resolveIssuerName(issuer);
      return this;
    },
    audit(auditor?: string | LoginFlowAuditor<TContext>): LoginFlowBuilder<TContext> {
      state.auditorTarget = auditor ?? 'trace';
      return this;
    },
    async run(): Promise<LoginFlowResult> {
      return runLoginFlow(state);
    },
  });
};

const create = <TContext>(
  options: LoginFlowCreateOptions<TContext>
): LoginFlowBuilder<TContext> => {
  return createBuilder({
    options,
    providerName: resolveProviderName(options.provider),
    identifyInput: undefined,
    verifyInput: undefined,
    issueTarget: undefined,
    issueName: undefined,
    auditorTarget: undefined,
    identifySet: false,
    verifySet: false,
  });
};

const registerProvider = <TContext>(name: string, provider: LoginFlowProvider<TContext>): void => {
  ensureNamedRegistration('provider', name);
  ensureProvider(provider);
  providerRegistry.set(name, provider as LoginFlowProvider<unknown>);
};

const unregisterProvider = (name: string): void => {
  providerRegistry.delete(name);
};

const hasProvider = (name: string): boolean => providerRegistry.has(name);

const registerIssuer = <TContext>(name: string, issuer: LoginFlowIssuer<TContext>): void => {
  ensureNamedRegistration('issuer', name);
  ensureHandler('issue', 'issuer', issuer);
  issuerRegistry.set(name, issuer as LoginFlowIssuer<unknown>);
};

const unregisterIssuer = (name: string): void => {
  issuerRegistry.delete(name);
};

const hasIssuer = (name: string): boolean => issuerRegistry.has(name);

const registerAuditor = <TContext>(name: string, auditor: LoginFlowAuditor<TContext>): void => {
  ensureNamedRegistration('auditor', name);
  ensureHandler('audit', 'auditor', auditor);
  auditorRegistry.set(name, auditor as LoginFlowAuditor<unknown>);
};

const unregisterAuditor = (name: string): void => {
  auditorRegistry.delete(name);
};

const hasAuditor = (name: string): boolean => auditorRegistry.has(name);

const clearRegistrations = (): void => {
  providerRegistry.clear();
  issuerRegistry.clear();
  auditorRegistry.clear();
  issuerRegistry.set('jwt', createJwtIssuer as LoginFlowIssuer<unknown>);
  issuerRegistry.set('bulletproof', createBulletproofIssuer as LoginFlowIssuer<unknown>);
  auditorRegistry.set('trace', createTraceAuditor as LoginFlowAuditor<unknown>);
};

clearRegistrations();

export const LoginFlow: LoginFlowNamespace = Object.freeze({
  create,
  registerProvider,
  unregisterProvider,
  hasProvider,
  registerIssuer,
  unregisterIssuer,
  hasIssuer,
  registerAuditor,
  unregisterAuditor,
  hasAuditor,
  clearRegistrations,
});
