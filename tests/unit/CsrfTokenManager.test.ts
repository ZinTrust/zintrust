import type { ICsrfTokenManager } from '@security/CsrfTokenManager';
import { CsrfTokenManager } from '@security/CsrfTokenManager';
import { beforeEach, describe, expect, it } from 'vitest';

describe('CsrfTokenManager Basic', () => {
  let manager: ICsrfTokenManager;

  beforeEach(() => {
    manager = CsrfTokenManager.create();
  });

  it('should generate token for session', async () => {
    const token = await manager.generateToken('session-1');

    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('should validate correct token', async () => {
    const sessionId = 'session-2';
    const token = await manager.generateToken(sessionId);

    const isValid = await manager.validateToken(sessionId, token);
    expect(isValid).toBe(true);
  });

  it('should reject invalid token', async () => {
    const sessionId = 'session-3';
    await manager.generateToken(sessionId);

    const isValid = await manager.validateToken(sessionId, 'invalid-token');
    expect(isValid).toBe(false);
  });

  it('should reject token for wrong session', async () => {
    const sessionId1 = 'session-4';
    const sessionId2 = 'session-5';

    const token = await manager.generateToken(sessionId1);
    const isValid = await manager.validateToken(sessionId2, token);

    expect(isValid).toBe(false);
  });

  it('should generate unique tokens', async () => {
    const token1 = await manager.generateToken('session-6');
    const token2 = await manager.generateToken('session-7');

    expect(token1).not.toEqual(token2);
  });

  it('should get token data', async () => {
    const sessionId = 'session-8';
    const token = await manager.generateToken(sessionId);

    const data = await manager.getTokenData(sessionId);

    expect(data).not.toBeNull();
    expect(data?.token).toBe(token);
    expect(data?.sessionId).toBe(sessionId);
    expect(data?.createdAt).toBeInstanceOf(Date);
    expect(data?.expiresAt).toBeInstanceOf(Date);
  });
});

describe('CsrfTokenManager Advanced Operations', () => {
  let manager: ICsrfTokenManager;

  beforeEach(() => {
    manager = CsrfTokenManager.create();
  });

  it('should invalidate token', async () => {
    const sessionId = 'session-9';
    const token = await manager.generateToken(sessionId);

    await manager.invalidateToken(sessionId);

    const isValid = await manager.validateToken(sessionId, token);
    expect(isValid).toBe(false);
  });

  it('should refresh token', async () => {
    const sessionId = 'session-10';
    const token = await manager.generateToken(sessionId);
    const originalData = await manager.getTokenData(sessionId);

    // Wait a bit to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));

    const refreshedToken = await manager.refreshToken(sessionId);

    expect(refreshedToken).toBe(token);

    const refreshedData = await manager.getTokenData(sessionId);
    expect(refreshedData?.expiresAt.getTime()).toBeGreaterThanOrEqual(
      originalData?.expiresAt.getTime() ?? 0
    );
  });

  it('should return null when refreshing non-existent token', async () => {
    const refreshedToken = await manager.refreshToken('non-existent');

    expect(refreshedToken).toBeNull();
  });

  it('should clean up expired tokens', async () => {
    const sessionId = 'session-11';
    await manager.generateToken(sessionId);

    const cleanedCount = await manager.cleanup();

    expect(cleanedCount).toBe(0); // Token not yet expired
  });
});

describe('CsrfTokenManager Advanced State', () => {
  let manager: ICsrfTokenManager;

  beforeEach(() => {
    manager = CsrfTokenManager.create();
  });

  it('should track token count', async () => {
    expect(await manager.getTokenCount()).toBe(0);

    await manager.generateToken('session-12');
    expect(await manager.getTokenCount()).toBe(1);

    await manager.generateToken('session-13');
    expect(await manager.getTokenCount()).toBe(2);
  });

  it('should clear all tokens', async () => {
    await manager.generateToken('session-14');
    await manager.generateToken('session-15');

    expect(await manager.getTokenCount()).toBe(2);

    await manager.clear();

    expect(await manager.getTokenCount()).toBe(0);
  });

  it('should handle token regeneration for same session', async () => {
    const sessionId = 'session-16';
    const token1 = await manager.generateToken(sessionId);
    const token2 = await manager.generateToken(sessionId);

    // New token should invalidate old one
    expect(token1).not.toEqual(token2);
    expect(await manager.validateToken(sessionId, token1)).toBe(false);
    expect(await manager.validateToken(sessionId, token2)).toBe(true);
  });

  it('should have consistent token length', async () => {
    const tokens = [
      await manager.generateToken('session-17'),
      await manager.generateToken('session-18'),
      await manager.generateToken('session-19'),
    ];

    const lengths = tokens.map((t) => t.length);
    expect(new Set(lengths).size).toBe(1); // All same length
  });
});
