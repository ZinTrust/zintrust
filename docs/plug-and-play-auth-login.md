# Plug & Play Auth & Login

`LoginFlow` is the ZinTrust Plug & Play auth/login surface.

It moves repeated login orchestration out of one-off controllers and into an explicit provider and issuer contract.

## Problem to solve

Service code often repeats the same login workflow:

1. load the account
2. verify credentials
3. issue a token or session
4. record audit context
5. return a normalized login result

## Available runtime

```ts
import { Auth, ErrorFactory, LoginFlow } from '@zintrust/core';

LoginFlow.registerProvider('password', {
  identify: async ({ email }) => User.where('email', '=', email).first(),
  verify: async (user, { password }) => {
    if (!user) {
      throw ErrorFactory.createUnauthorizedError('Invalid credentials');
    }

    const ok = await Auth.compare(password, String(user.password ?? ''));
    if (!ok) {
      throw ErrorFactory.createUnauthorizedError('Invalid credentials');
    }

    return {
      user,
      subject: String(user.id),
      claims: {
        sub: String(user.id),
        email: String(user.email),
      },
    };
  },
});

const result = await LoginFlow.create({
  provider: 'password',
  context: {
    requestId: req.getHeader('x-request-id'),
  },
})
  // This exact object becomes provider.identify({ email }, context)
  .identify({ email })
  // This exact object becomes provider.verify(identity, { password }, context)
  .verify({ password })
  .issue('jwt')
  .audit()
  .run();

res.json({
  token: result.issued,
  user: result.verified.user,
});
```

## How inputs are passed

Nothing in `LoginFlow` picks up `email` or `password` by magic.

1. `.identify({ email })` stores `{ email }` and later passes it to `provider.identify(input, context)`.
2. `.verify({ password })` stores `{ password }` and later passes it to `provider.verify(identity, input, context)`.
3. `context` is exactly what the application supplied to `LoginFlow.create({ context })`.

So this:

```ts
LoginFlow.create({ provider: 'password', context: { requestId } })
  .identify({ email })
  .verify({ password });
```

becomes this at runtime:

```ts
provider.identify({ email }, { requestId });
provider.verify(identity, { password }, { requestId });
```

## What the core owns

`LoginFlow` provides:

1. explicit provider registration
2. staged orchestration for `identify()`, `verify()`, `issue()`, and `audit()`
3. a built-in `jwt` issuer backed by `JwtManager.signAccessToken(...)`
4. a built-in `trace` auditor used by `.audit()` when no custom auditor is supplied
5. normalized staged failures with `stage` metadata

## What the application still owns

Applications still decide:

1. how an account is located
2. how credentials are verified
3. which claims are issued
4. whether to use the built-in `jwt` issuer or a custom issuer
5. whether to use the built-in `trace` auditor or a custom audit sink

## Custom issuer example

```ts
LoginFlow.registerIssuer('session', async ({ verified, context }) => {
  return context.sessions.create({
    sub: verified.subject,
    user: verified.user,
  });
});

const result = await LoginFlow.create({
  provider: 'password',
  context: {
    sessions: SessionManager.create({ cookieName: 'SID' }),
  },
})
  .identify({ email })
  .verify({ password })
  .issue('session')
  .run();
```

## Custom audit example

```ts
LoginFlow.registerAuditor('auth-log', async ({ status, stage, verified, context }) => {
  Logger.info('login flow finished', {
    status,
    stage,
    subject: verified?.subject,
    requestId: context.requestId,
  });
});

await LoginFlow.create({
  provider: 'password',
  context: { requestId: req.getHeader('x-request-id') },
})
  .identify({ email })
  .verify({ password })
  .issue('jwt')
  .audit('auth-log')
  .run();
```

## Product-fit rules

The login Plug & Play surface should:

1. keep provider registration explicit
2. avoid retaining request objects after the flow completes
3. support Node and Workers runtimes
4. keep transport-specific concerns outside the core orchestration contract
5. keep provider and issuer registries bounded and explicitly manageable

## Current related docs

1. Use [authentication](/authentication) for JWT configuration, route protection, and revocation setup.
2. Use [plug-and-play-performance](/plug-and-play-performance) for the retention rules that keep login orchestration from turning into a process-global cache.
