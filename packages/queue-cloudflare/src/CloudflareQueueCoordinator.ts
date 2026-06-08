import type { LeaseInput, LeaseResult, RateLimitInput, RateLimitResult } from './types.js';

type DurableObjectStorageLike = {
  get: <T = unknown>(key: string) => Promise<T | undefined>;
  put: (key: string, value: unknown) => Promise<void>;
  delete: (key: string) => Promise<void>;
};

type DurableObjectStateLike = {
  storage: DurableObjectStorageLike;
};

type LeaseRecord = {
  owner: string;
  expiresAt: number;
};

type RateLimitRecord = {
  remaining: number;
  resetAt: number;
};

const leaseKey = (queueName: string, jobId: string): string => `lease:${queueName}:${jobId}`;
const pausedKey = (queueName: string): string => `paused:${queueName}`;
const rateLimitKey = (key: string): string => `rate:${key}`;

// eslint-disable-next-line no-restricted-syntax
export class CloudflareQueueCoordinator {
  readonly state: DurableObjectStateLike;

  constructor(state: DurableObjectStateLike) {
    this.state = state;
  }

  async acquireLease(input: LeaseInput): Promise<LeaseResult> {
    const key = leaseKey(input.queueName, input.jobId);
    const existing = await this.state.storage.get<LeaseRecord>(key);
    const now = Date.now();

    if (existing !== undefined && existing.expiresAt > now && existing.owner !== input.workerId) {
      return { acquired: false, owner: existing.owner, expiresAt: existing.expiresAt };
    }

    const expiresAt = now + Math.max(1000, input.ttlMs);
    await this.state.storage.put(key, { owner: input.workerId, expiresAt });
    return { acquired: true, owner: input.workerId, expiresAt };
  }

  async heartbeat(input: LeaseInput): Promise<LeaseResult> {
    return await this.acquireLease(input);
  }

  async releaseLease(input: LeaseInput): Promise<void> {
    const key = leaseKey(input.queueName, input.jobId);
    const existing = await this.state.storage.get<LeaseRecord>(key);
    if (existing === undefined || existing.owner === input.workerId) {
      await this.state.storage.delete(key);
    }
  }

  async pause(queueName = 'default'): Promise<void> {
    await this.state.storage.put(pausedKey(queueName), true);
  }

  async resume(queueName = 'default'): Promise<void> {
    await this.state.storage.delete(pausedKey(queueName));
  }

  async isPaused(queueName = 'default'): Promise<boolean> {
    return (await this.state.storage.get<boolean>(pausedKey(queueName))) === true;
  }

  async rateLimit(input: RateLimitInput): Promise<RateLimitResult> {
    const now = Date.now();
    const max = Math.max(1, Math.floor(input.max));
    const durationMs = Math.max(1000, Math.floor(input.durationMs));
    const key = rateLimitKey(input.key);
    const existing = await this.state.storage.get<RateLimitRecord>(key);

    if (existing === undefined || existing.resetAt <= now) {
      const record = { remaining: max - 1, resetAt: now + durationMs };
      await this.state.storage.put(key, record);
      return { allowed: true, ...record };
    }

    if (existing.remaining <= 0) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }

    const record = { remaining: existing.remaining - 1, resetAt: existing.resetAt };
    await this.state.storage.put(key, record);
    return { allowed: true, ...record };
  }
}
