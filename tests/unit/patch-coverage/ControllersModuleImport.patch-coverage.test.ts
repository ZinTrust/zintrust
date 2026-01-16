import { describe, expect, it } from 'vitest';

// Smoke-import controllers to exercise module initialization lines
describe('patch coverage: controllers module imports', () => {
  it('imports auth and user controllers without throwing', async () => {
    const { AuthController } = await import('@app/Controllers/AuthController');
    const { UserQueryBuilderController } =
      await import('@app/Controllers/UserQueryBuilderController');
    const { UserController } = await import('@app/Controllers/UserController');

    expect(AuthController).toBeDefined();
    expect(UserQueryBuilderController).toBeDefined();
    expect(UserController).toBeDefined();
  });
});
