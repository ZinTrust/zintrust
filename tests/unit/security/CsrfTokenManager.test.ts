import type { ICsrfTokenManager } from '@/security/CsrfTokenManager';
import { CsrfTokenManager } from '@/security/CsrfTokenManager';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CsrfTokenManager', () => {
  let csrfManager: ICsrfTokenManager;

  beforeEach(() => {
    csrfManager = CsrfTokenManager.create();
  });

  it('should generate a token for a session', async () => {
    const sessionId = 'session-123';
    const token = await csrfManager.generateToken(sessionId);

    expect(token).toBeDefined();
    expect(token.length).toBeGreaterThan(0);
    expect(await csrfManager.getTokenCount()).toBe(1);
  });

  it('should validate a valid token', async () => {
    const sessionId = 'session-123';
    const token = await csrfManager.generateToken(sessionId);

    const isValid = await csrfManager.validateToken(sessionId, token);
    expect(isValid).toBe(true);
  });

  it('should reject an invalid token', async () => {
    const sessionId = 'session-123';
    await csrfManager.generateToken(sessionId);

    const isValid = await csrfManager.validateToken(sessionId, 'invalid-token');
    expect(isValid).toBe(false);
  });

  it('should reject a token for a non-existent session', async () => {
    const isValid = await csrfManager.validateToken('non-existent-session', 'some-token');
    expect(isValid).toBe(false);
  });

  it('should reject an expired token', async () => {
    const sessionId = 'session-123';
    const token = await csrfManager.generateToken(sessionId);

    // Mock Date to simulate expiration
    const futureDate = new Date(Date.now() + 3600000 + 1000); // 1 hour + 1 second
    vi.setSystemTime(futureDate);

    const isValid = await csrfManager.validateToken(sessionId, token);
    expect(isValid).toBe(false);

    // Should be removed after validation check
    expect(await csrfManager.getTokenData(sessionId)).toBeNull();

    vi.useRealTimers();
  });

  it('should invalidate a token', async () => {
    const sessionId = 'session-123';
    const token = await csrfManager.generateToken(sessionId);

    await csrfManager.invalidateToken(sessionId);

    const isValid = await csrfManager.validateToken(sessionId, token);
    expect(isValid).toBe(false);
    expect(await csrfManager.getTokenCount()).toBe(0);
  });

  it('should refresh a token (extend TTL)', async () => {
    const sessionId = 'session-123';
    const token = await csrfManager.generateToken(sessionId);
    const initialData = await csrfManager.getTokenData(sessionId);
    const initialExpiry = initialData?.expiresAt.getTime();
    if (initialExpiry === undefined) {
      throw new Error('Initial expiry is undefined');
    }

    // Advance time slightly
    vi.setSystemTime(new Date(Date.now() + 1000));

    const refreshedToken = await csrfManager.refreshToken(sessionId);
    const refreshedData = await csrfManager.getTokenData(sessionId);

    expect(refreshedToken).toBe(token);
    expect(refreshedData?.expiresAt.getTime()).toBeGreaterThan(initialExpiry);

    vi.useRealTimers();
  });

  it('should return null when refreshing a missing session token', async () => {
    const refreshedToken = await csrfManager.refreshToken('missing-session');
    expect(refreshedToken).toBeNull();
  });

  it('should not refresh an expired token', async () => {
    const sessionId = 'session-123';
    await csrfManager.generateToken(sessionId);

    // Advance time past expiration
    vi.setSystemTime(new Date(Date.now() + 3600000 + 1000));

    const refreshedToken = await csrfManager.refreshToken(sessionId);
    expect(refreshedToken).toBeNull();
    expect(await csrfManager.getTokenData(sessionId)).toBeNull();

    vi.useRealTimers();
  });

  it('should cleanup expired tokens', async () => {
    const session1 = 'session-1';
    const session2 = 'session-2';

    await csrfManager.generateToken(session1);
    await csrfManager.generateToken(session2);

    // Expire session1
    const tokenData1 = await csrfManager.getTokenData(session1);
    if (tokenData1 !== null) {
      tokenData1.expiresAt = new Date(Date.now() - 1000);
    }

    const removed = await csrfManager.cleanup();
    expect(removed).toBe(1);
    expect(await csrfManager.getTokenCount()).toBe(1);
    expect(await csrfManager.getTokenData(session1)).toBeNull();
    expect(await csrfManager.getTokenData(session2)).not.toBeNull();
  });

  it('should clear all tokens', async () => {
    await csrfManager.generateToken('s1');
    await csrfManager.generateToken('s2');

    await csrfManager.clear();
    expect(await csrfManager.getTokenCount()).toBe(0);
  });
});
