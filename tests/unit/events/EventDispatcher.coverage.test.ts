import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    error: vi.fn(),
  },
}));

describe('EventDispatcher coverage', () => {
  it('logs async listener errors on emit', async () => {
    const { EventDispatcher } = await import('@/events/EventDispatcher');
    const { Logger } = await import('@config/logger');

    const dispatcher = EventDispatcher.create<{ test: { value: number } }>();
    dispatcher.on('test', async () => {
      throw new Error('boom');
    });

    dispatcher.emit('test', { value: 1 });

    await Promise.resolve();

    expect(Logger.error).toHaveBeenCalledWith('Unhandled async event listener error', {
      event: 'test',
      error: expect.any(Error),
    });
  });
});
