import {
  type IPasswordResetTokenBroker,
  PasswordResetTokenBroker,
} from '@security/PasswordResetTokenBroker';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PasswordResetTokenBroker', () => {
  let broker: IPasswordResetTokenBroker;

  beforeEach(() => {
    broker = PasswordResetTokenBroker.create();
  });

  it('creates and verifies a token for an identifier', async () => {
    const identifier = 'user@example.com';
    const token = await broker.createToken(identifier);

    expect(token).toBeDefined();
    expect(token.length).toBeGreaterThan(0);

    await expect(broker.verifyToken(identifier, token)).resolves.toBe(true);
    await expect(broker.verifyToken(identifier, 'invalid-token')).resolves.toBe(false);
  });

  it('rejects expired tokens and removes them', async () => {
    const identifier = 'user@example.com';
    const token = await broker.createToken(identifier);

    vi.setSystemTime(new Date(Date.now() + 30 * 60 * 1000 + 1000));

    await expect(broker.verifyToken(identifier, token)).resolves.toBe(false);

    // Subsequent checks should still be false (record should be deleted)
    await expect(broker.verifyToken(identifier, token)).resolves.toBe(false);

    vi.useRealTimers();
  });

  it('consumes token (one-time use)', async () => {
    const identifier = 'user@example.com';
    const token = await broker.createToken(identifier);

    await expect(broker.consumeToken(identifier, token)).resolves.toBe(true);
    await expect(broker.consumeToken(identifier, token)).resolves.toBe(false);
  });

  it('overwrites prior token for same identifier', async () => {
    const identifier = 'user@example.com';
    const token1 = await broker.createToken(identifier);
    const token2 = await broker.createToken(identifier);

    expect(token1).not.toBe(token2);

    await expect(broker.verifyToken(identifier, token1)).resolves.toBe(false);
    await expect(broker.verifyToken(identifier, token2)).resolves.toBe(true);
  });

  it('trims identifier and token inputs', async () => {
    const identifier = '  user@example.com  ';
    const token = await broker.createToken(identifier);

    await expect(broker.verifyToken('user@example.com', `  ${token}  `)).resolves.toBe(true);
  });

  it('validates identifier/token inputs', async () => {
    await expect(broker.createToken('')).rejects.toThrow(/Invalid identifier/i);
    await expect(broker.verifyToken('user@example.com', '')).rejects.toThrow(/Invalid token/i);
    await expect(broker.consumeToken(' ', 'token')).rejects.toThrow(/Invalid identifier/i);

    await expect(broker.verifyToken(123 as unknown as string, 'token')).rejects.toThrow(
      /Invalid identifier/i
    );
    await expect(broker.verifyToken('user@example.com', 123 as unknown as string)).rejects.toThrow(
      /Invalid token/i
    );
  });

  it('validates ttlMs and tokenBytes options', async () => {
    expect(() => PasswordResetTokenBroker.create({ ttlMs: 0 })).toThrow(
      /Invalid password reset TTL/i
    );
    expect(() => PasswordResetTokenBroker.create({ tokenBytes: 0 })).toThrow(
      /Invalid password reset token bytes/i
    );
  });

  it('in-memory store cleanup and clear work', async () => {
    const store = PasswordResetTokenBroker.createInMemoryStore();
    const now = new Date('2026-01-01T00:00:00.000Z');

    const custom = PasswordResetTokenBroker.create({
      store,
      ttlMs: 10,
      now: () => now,
    });

    const token = await custom.createToken('user@example.com');
    expect(await custom.verifyToken('user@example.com', token)).toBe(true);

    const removed = await store.cleanup?.(new Date(now.getTime() + 1000));
    expect(removed).toBe(1);

    await store.clear?.();
    expect(await custom.verifyToken('user@example.com', token)).toBe(false);
  });
});
