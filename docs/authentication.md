# Authentication

Zintrust provides a flexible authentication system that supports multiple drivers, including JWT and Session-based auth.

## Configuration

Authentication is configured in `config/auth.ts`.

```typescript
export default {
  default: 'jwt',
  guards: {
    jwt: {
      driver: 'jwt',
      secret: process.env.JWT_SECRET,
      expiresIn: '1h',
    },
    session: {
      driver: 'session',
      provider: 'users',
    },
  },
};
```

## Using the Auth Guard

```typescript
import { Auth } from '@auth/Auth';

// Attempt login
const token = await Auth.guard('jwt').attempt({ email, password });

if (token) {
  return res.json({ token });
}

// Get authenticated user
const user = await Auth.user();

// Check if authenticated
if (await Auth.check()) {
  // ...
}
```

## Protecting Routes

Use the `auth` middleware to protect your routes:

```typescript
router.get('/profile', 'ProfileController@show', { middleware: ['auth'] });
```

## API Key Authentication

For service-to-service communication, you can use API keys:

```typescript
router.group({ middleware: ['auth:api-key'] }, (r) => {
  r.get('/internal/stats', 'StatsController@index');
});
```
