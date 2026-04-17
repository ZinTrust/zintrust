import { SystemTraceBridge } from '@/trace/SystemTraceBridge';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isArray, isFunction, isNonEmptyString } from '@helper/index';

export type NotificationComposePolicy = 'required' | 'best_effort';

export type NotificationChannelHandler<TPayload = unknown, TContext = unknown> = (
  payload: TPayload,
  context: TContext
) => Promise<unknown>;

export type NotificationComposeChannelResult = {
  channel: string;
  policy: NotificationComposePolicy;
  ok: boolean;
  payload: unknown;
  result?: unknown;
  error?: unknown;
};

export type NotificationComposeResult = {
  ok: boolean;
  results: NotificationComposeChannelResult[];
};

export type NotificationComposeError = Error & {
  results: NotificationComposeChannelResult[];
};

export type NotificationComposeOptions<TContext = unknown> = {
  context?: TContext;
};

export type NotificationComposeBuilder<TContext = unknown> = {
  channel: (name: string, payload: unknown) => NotificationComposeBuilder<TContext>;
  email: (payload: unknown) => NotificationComposeBuilder<TContext>;
  push: (payload: unknown) => NotificationComposeBuilder<TContext>;
  sms: (payload: unknown) => NotificationComposeBuilder<TContext>;
  webhook: (payload: unknown) => NotificationComposeBuilder<TContext>;
  required: (channels: string[]) => NotificationComposeBuilder<TContext>;
  bestEffort: (channels: string[]) => NotificationComposeBuilder<TContext>;
  send: () => Promise<NotificationComposeResult>;
};

export type NotificationComposerNamespace = {
  compose: <TContext = unknown>(
    options?: NotificationComposeOptions<TContext>
  ) => NotificationComposeBuilder<TContext>;
  registerChannel: <TPayload = unknown, TContext = unknown>(
    name: string,
    handler: NotificationChannelHandler<TPayload, TContext>
  ) => void;
  unregisterChannel: (name: string) => void;
  hasChannel: (name: string) => boolean;
  listChannels: () => string[];
  clearChannels: () => void;
};

type NotificationChannelEntry = {
  channel: string;
  payload: unknown;
};

const channelRegistry = new Map<string, NotificationChannelHandler<unknown, unknown>>();

const normalizeChannelName = (name: string): string => {
  const normalized = String(name ?? '')
    .trim()
    .toLowerCase();

  if (!isNonEmptyString(normalized)) {
    throw ErrorFactory.createValidationError(
      'Notification channel name must be a non-empty string'
    );
  }

  return normalized;
};

const createComposeError = (
  message: string,
  results: NotificationComposeChannelResult[]
): NotificationComposeError => {
  return Object.assign(
    ErrorFactory.createValidationError(message, {
      results,
    }),
    { results }
  ) as NotificationComposeError;
};

const ensureChannelsInput = (channels: string[]): string[] => {
  if (!isArray(channels)) {
    throw ErrorFactory.createValidationError('Notification compose channel list must be an array');
  }

  return channels.map((channel) => normalizeChannelName(channel));
};

const ensureHandler = (handler: unknown): void => {
  if (!isFunction(handler)) {
    throw ErrorFactory.createValidationError('Notification channel handler must be a function');
  }
};

const getPolicy = (
  policies: Map<string, NotificationComposePolicy>,
  channel: string
): NotificationComposePolicy => {
  return policies.get(channel) ?? 'required';
};

const ensureEntries = (entries: NotificationChannelEntry[]): void => {
  if (entries.length === 0) {
    throw ErrorFactory.createValidationError(
      'Notification compose requires at least one channel before send()'
    );
  }
};

const deliverEntry = async <TContext>(
  entry: NotificationChannelEntry,
  policy: NotificationComposePolicy,
  context: TContext | undefined
): Promise<NotificationComposeChannelResult> => {
  const handler = channelRegistry.get(entry.channel);

  if (!handler) {
    return {
      channel: entry.channel,
      policy,
      ok: false,
      payload: entry.payload,
      error: ErrorFactory.createConfigError(
        `Notification compose channel not registered: ${entry.channel}`
      ),
    };
  }

  try {
    const result = await handler(entry.payload, context);
    SystemTraceBridge.emitNotification(
      `compose:${entry.channel}`,
      [entry.channel],
      undefined,
      undefined,
      entry.payload
    );

    return {
      channel: entry.channel,
      policy,
      ok: true,
      payload: entry.payload,
      result,
    };
  } catch (error) {
    return {
      channel: entry.channel,
      policy,
      ok: false,
      payload: entry.payload,
      error,
    };
  }
};

const hasRequiredFailure = (results: NotificationComposeChannelResult[]): boolean => {
  return results.some((entry) => !entry.ok && entry.policy === 'required');
};

const compose = <TContext = unknown>(
  options: NotificationComposeOptions<TContext> = {}
): NotificationComposeBuilder<TContext> => {
  const entries: NotificationChannelEntry[] = [];
  const policies = new Map<string, NotificationComposePolicy>();

  const builder: NotificationComposeBuilder<TContext> = Object.freeze({
    channel(name: string, payload: unknown): NotificationComposeBuilder<TContext> {
      entries.push({ channel: normalizeChannelName(name), payload });
      return this;
    },
    email(payload: unknown): NotificationComposeBuilder<TContext> {
      return this.channel('email', payload);
    },
    push(payload: unknown): NotificationComposeBuilder<TContext> {
      return this.channel('push', payload);
    },
    sms(payload: unknown): NotificationComposeBuilder<TContext> {
      return this.channel('sms', payload);
    },
    webhook(payload: unknown): NotificationComposeBuilder<TContext> {
      return this.channel('webhook', payload);
    },
    required(channels: string[]): NotificationComposeBuilder<TContext> {
      for (const channel of ensureChannelsInput(channels)) {
        policies.set(channel, 'required');
      }
      return this;
    },
    bestEffort(channels: string[]): NotificationComposeBuilder<TContext> {
      for (const channel of ensureChannelsInput(channels)) {
        policies.set(channel, 'best_effort');
      }
      return this;
    },
    async send(): Promise<NotificationComposeResult> {
      ensureEntries(entries);

      const results = await Promise.all(
        entries.map(async (entry) =>
          deliverEntry(entry, getPolicy(policies, entry.channel), options.context)
        )
      );

      if (hasRequiredFailure(results)) {
        throw createComposeError('Notification compose failed for required channels', results);
      }

      return {
        ok: true,
        results,
      };
    },
  });

  return builder;
};

const registerChannel = <TPayload = unknown, TContext = unknown>(
  name: string,
  handler: NotificationChannelHandler<TPayload, TContext>
): void => {
  ensureHandler(handler);
  channelRegistry.set(
    normalizeChannelName(name),
    handler as NotificationChannelHandler<unknown, unknown>
  );
};

const unregisterChannel = (name: string): void => {
  channelRegistry.delete(normalizeChannelName(name));
};

const hasChannel = (name: string): boolean => channelRegistry.has(normalizeChannelName(name));

const listChannels = (): string[] => {
  return Array.from(channelRegistry.keys()).sort((left, right) => left.localeCompare(right));
};

const clearChannels = (): void => {
  channelRegistry.clear();
};

export const NotificationComposer: NotificationComposerNamespace = Object.freeze({
  compose,
  registerChannel,
  unregisterChannel,
  hasChannel,
  listChannels,
  clearChannels,
});
