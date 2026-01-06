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
});
