/**
 * Slack Notification Logger
 * Sends warn/error/fatal log events to a Slack incoming webhook.
 *
 * Enabled via env:
 *  - SLACK_LOG_ENABLED (default: false)
 *  - SLACK_LOG_WEBHOOK_URL
 *  - SLACK_LOG_LEVELS (comma-separated; default: "warn,error,fatal")
 *  - SLACK_LOG_BATCH_WINDOW_MS (default: 5000)
 */

import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { HttpClient } from '@httpClient/Http';

export type SlackLogEvent = {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  category?: string;
  data?: unknown;
  error?: string;
};

type SlackPayload = {
  text?: string;
  attachments?: Array<{ color?: string; text: string }>;
};

const isEnabled = (): boolean => Env.getBool('SLACK_LOG_ENABLED', false);

const getLevels = (): Set<string> => {
  const raw = Env.get('SLACK_LOG_LEVELS', 'warn,error,fatal');
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0)
  );
};

const levelToColor = (level: SlackLogEvent['level']): string => {
  if (level === 'fatal' || level === 'error') return '#D50200';
  if (level === 'warn') return '#D39E00';
  return '#439FE0';
};

const formatEventText = (ev: SlackLogEvent): string => {
  const header = `*${ev.level.toUpperCase()}* ${ev.message}`;
  const metaParts: string[] = [];
  if (ev.category !== undefined) metaParts.push(`category=${ev.category}`);
  metaParts.push(`ts=${ev.timestamp}`);

  const meta = metaParts.length > 0 ? `\n_${metaParts.join(' ')}_` : '';

  const err = ev.error === undefined ? '' : `\n*error:* ${String(ev.error)}`;
  const data = ev.data === undefined ? '' : `\n*data:* \`${JSON.stringify(ev.data)}\``;

  return `${header}${meta}${err}${data}`;
};

let buffer: SlackLogEvent[] = [];
let flushPromise: Promise<void> | undefined;
let dedupeKeys = new Set<string>();

const dedupeKeyFor = (ev: SlackLogEvent): string => {
  const base = `${ev.level}:${ev.message}:${ev.error ?? ''}`;
  return base.length > 500 ? base.slice(0, 500) : base;
};

const sendBatch = async (events: SlackLogEvent[]): Promise<void> => {
  const webhookUrl = Env.get('SLACK_LOG_WEBHOOK_URL').trim();
  if (webhookUrl.length === 0) {
    throw ErrorFactory.createConfigError(
      'SLACK_LOG_WEBHOOK_URL is required when Slack logging is enabled'
    );
  }

  const lines = events.map((e) => formatEventText(e)).join('\n\n');

  const payload: SlackPayload = {
    attachments: [
      {
        color: levelToColor(events[0]?.level ?? 'warn'),
        text: lines,
      },
    ],
  };

  await HttpClient.post(webhookUrl, payload).send();
};

const flushNow = async (): Promise<void> => {
  const toSend = buffer;
  buffer = [];
  dedupeKeys = new Set<string>();

  if (!isEnabled()) return;
  if (toSend.length === 0) return;

  try {
    await sendBatch(toSend);
  } catch {
    // Best-effort: never throw from logging.
  }
};

const scheduleFlush = async (): Promise<void> => {
  if (flushPromise !== undefined) return flushPromise;

  const windowMs = Math.max(0, Env.getInt('SLACK_LOG_BATCH_WINDOW_MS', 5000));

  const promise = new Promise<void>((resolve) => {
    const run = async (): Promise<void> => {
      try {
        await flushNow();
      } finally {
        resolve(undefined);
      }
    };

    if (windowMs === 0 || typeof globalThis.setTimeout !== 'function') {
      void run();
      return;
    }

    globalThis.setTimeout(() => {
      void run();
    }, windowMs);
  });

  flushPromise = promise.finally(() => {
    flushPromise = undefined;
  });

  return flushPromise;
};

export const SlackLogger = Object.freeze({
  async enqueue(event: SlackLogEvent): Promise<void> {
    if (!isEnabled()) return;

    const levels = getLevels();
    if (!levels.has(event.level)) return;

    const key = dedupeKeyFor(event);
    if (dedupeKeys.has(key)) return scheduleFlush();

    dedupeKeys.add(key);
    buffer.push(event);

    return scheduleFlush();
  },
});

export default SlackLogger;
