import { describe, expect, it } from 'vitest';
import { createDefaultMiddlewareFailureBody } from '@middleware/MiddlewareFailureBody';

describe('patch coverage: MiddlewareFailureBody', () => {
  it('creates default failure body correctly', () => {
    const result = createDefaultMiddlewareFailureBody({
      reason: 'test_reason',
      message: 'Test message',
    });

    expect(result).toEqual({
      error: {
        code: 'test_reason',
        message: 'Test message',
      },
    });
  });
});
