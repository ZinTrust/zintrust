/* eslint-disable max-nested-callbacks */
import { describe, expect, it, vi } from 'vitest';

import { ContextLoader } from '@common/ContextLoader';

describe('ContextLoader', () => {
  it('resolves sequential loads in registration order', async () => {
    const calls: string[] = [];

    const context = await ContextLoader.create()
      .load('user', async () => {
        calls.push('user');
        return { id: 'u1' };
      })
      .load('profile', async ({ user }) => {
        calls.push('profile');
        return { userId: (user as { id: string }).id };
      })
      .load('wallet', async ({ user, profile }) => {
        calls.push('wallet');
        return {
          userId: (user as { id: string }).id,
          profileUserId: (profile as { userId: string }).userId,
        };
      })
      .resolve<{
        user: { id: string };
        profile: { userId: string };
        wallet: { userId: string; profileUserId: string };
      }>();

    expect(calls).toEqual(['user', 'profile', 'wallet']);
    expect(context).toEqual({
      user: { id: 'u1' },
      profile: { userId: 'u1' },
      wallet: { userId: 'u1', profileUserId: 'u1' },
    });
  });

  it('memoizes resolve() for the same plan', async () => {
    const userSpy = vi.fn(async () => ({ id: 'u1' }));

    const plan = ContextLoader.create()
      .load('user', userSpy)
      .load('wallet', async ({ user }) => ({ userId: (user as { id: string }).id }));

    const [first, second] = await Promise.all([plan.resolve(), plan.resolve()]);

    expect(userSpy).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('batches fromBatch() calls across concurrent plans', async () => {
    const batchSpy = vi.fn(async (ids: Array<string | number>) => {
      return new Map(ids.map((id) => [id, { id, userId: id }]));
    });

    const loader = ContextLoader.create({ mode: 'batch' }).batch('profilesByUserId', batchSpy);

    const [left, right] = await Promise.all([
      loader
        .load('user', async () => ({ id: 'u1' }))
        .load('profile', async ({ user }) =>
          loader.fromBatch('profilesByUserId', (user as { id: string }).id)
        )
        .resolve<{ user: { id: string }; profile: { id: string; userId: string } }>(),
      loader
        .load('user', async () => ({ id: 'u2' }))
        .load('profile', async ({ user }) =>
          loader.fromBatch('profilesByUserId', (user as { id: string }).id)
        )
        .resolve<{ user: { id: string }; profile: { id: string; userId: string } }>(),
    ]);

    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy).toHaveBeenCalledWith(['u1', 'u2']);
    expect(left.profile).toEqual({ id: 'u1', userId: 'u1' });
    expect(right.profile).toEqual({ id: 'u2', userId: 'u2' });
  });

  it('returns null for missing batch values', async () => {
    const loader = ContextLoader.create({ mode: 'batch' }).batch(
      'walletsByUserId',
      async () => ({})
    );

    const context = await loader
      .load('user', async () => ({ id: 'u1' }))
      .load('wallet', async ({ user }) =>
        loader.fromBatch('walletsByUserId', (user as { id: string }).id)
      )
      .resolve<{ user: { id: string }; wallet: null }>();

    expect(context.wallet).toBeNull();
  });

  it('throws when a duplicate load key is registered', () => {
    const plan = ContextLoader.create().load('user', async () => ({ id: 'u1' }));

    expect(() => plan.load('user', async () => ({ id: 'u2' }))).toThrow(/already registered/i);
  });

  it('supports sequential fromBatch and batch registry lifecycle helpers', async () => {
    const loader = ContextLoader.create()
      .batch('profilesByUserId', async (ids) => new Map(ids.map((id) => [id, { id }])))
      .batch('walletsByUserId', async () => new Map());

    expect(loader.hasBatch('profilesByUserId')).toBe(true);
    expect(loader.listBatches()).toEqual(['profilesbyuserid', 'walletsbyuserid']);

    await expect(loader.fromBatch('profilesByUserId', 'u1')).resolves.toEqual({ id: 'u1' });

    loader.unregisterBatch('walletsByUserId');
    expect(loader.hasBatch('walletsByUserId')).toBe(false);

    loader.clearBatches();
    expect(loader.listBatches()).toEqual([]);
  });

  it('validates batch inputs and throws for missing batch handlers', async () => {
    const loader = ContextLoader.create();

    await expect(loader.fromBatch('missing', 'u1')).rejects.toThrow(/not registered/i);
    expect(() => loader.batch('', async () => new Map())).toThrow(
      /batch name must be a non-empty string/i
    );
    expect(() => loader.batch('ok', undefined as never)).toThrow(
      /batch handler must be a function/i
    );
    await expect(
      loader.batch('ok', async () => new Map()).fromBatch('ok', '' as never)
    ).rejects.toThrow(/batch key must be a non-empty string or finite number/i);
  });
});
