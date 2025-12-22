# Testing

Zintrust comes with a comprehensive testing suite powered by **Vitest**. We believe that testing should be an integral part of the development process, not an afterthought.

## Running Tests

To run the entire test suite:

```bash
npm test
```

To run tests in watch mode (great for development):

```bash
npm run test:watch
```

To generate a coverage report:

```bash
npm run test:coverage
```

## Testing Structure

Zintrust applications typically follow this testing structure:

```
tests/
├── unit/           # Unit tests for individual classes/functions
├── integration/    # Integration tests for API endpoints and database
└── feature/        # Feature-specific tests
```

## Writing Tests

### Unit Tests

Unit tests focus on testing a single piece of logic in isolation. Zintrust uses Vitest's compatible API (describe, it, expect).

```typescript
import { describe, it, expect } from 'vitest';
import { Calculator } from '@/services/Calculator';

describe('Calculator', () => {
  it('should add two numbers', () => {
    const calc = new Calculator();
    expect(calc.add(2, 3)).toBe(5);
  });
});
```

### Integration Tests

Integration tests verify that different parts of your application work together, such as Controllers and Models.

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Application } from '@/Application';
import request from 'supertest';

describe('User API', () => {
  let app: Application;

  beforeAll(async () => {
    app = new Application(process.cwd());
    await app.boot();
  });

  it('should list users', async () => {
    const response = await request(app.getHttpServer()).get('/api/users');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
  });
});
```

## Mocking

Zintrust leverages Vitest's powerful mocking capabilities. You can mock external dependencies, database calls, or even internal services.

```typescript
import { vi } from 'vitest';
import { UserService } from '@/services/UserService';

// Mock the entire module
vi.mock('@/services/UserService');

it('should call user service', () => {
  // ... test logic
});
```

## Continuous Integration

Zintrust includes a `zin qa` command that runs your tests along with linting and type checking. This is perfect for CI/CD pipelines.

```bash
zin qa
```
