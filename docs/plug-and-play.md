# Plug & Play

Plug & Play is the ZinTrust surface for reusable, composable framework workflows that developers would otherwise rebuild in every service.

The first shipped Plug & Play slice focuses on workflows that already exist across services and need one product-ready contract:

1. secure payload decoding
2. auth and login orchestration
3. notification composition
4. context loading

The goal is not to hide application logic. The goal is to provide a stable orchestration layer with:

1. consistent API shape
2. normalized failure semantics
3. reusable adapter registration
4. bounded-state runtime behavior
5. Node and Cloudflare Workers compatibility

## Design Rules

Every Plug & Play feature should follow these runtime rules:

1. no unbounded in-memory request caches
2. explicit cleanup for retained state
3. low-cardinality metrics and structured logs
4. request-scoped or invocation-scoped state by default
5. adapters provide integration details, core provides orchestration

## Available Today

### Secure payload decoding

Use [plug-and-play-secure-payload](/plug-and-play-secure-payload) for encrypted payload pipelines that decrypt, parse JSON, coerce values, validate schema, and return typed results.

### Auth and login orchestration

Use [plug-and-play-auth-login](/plug-and-play-auth-login) for the `LoginFlow` contract that centralizes account lookup, credential verification, token issuance, and audit hooks without retaining request state after the flow completes.

### Notification composer

Use [plug-and-play-notification-composer](/plug-and-play-notification-composer) for `Notification.compose(...)`, which coordinates required and best-effort delivery across registered channels without pushing orchestration glue into every service.

### Context loader

Use [plug-and-play-context-loader](/plug-and-play-context-loader) for `ContextLoader.create()`, which centralizes dependency-ordered context assembly and optional batch fan-out loading without pretending every graph collapses to one query.

### Context loader

Request-scoped context loading and optional batching is now available through `ContextLoader`.

## Example: secure payload flow

```ts
import { Schema, SecurePayload } from '@zintrust/core';

SecurePayload.registerDecryptor('payments', async (raw, context) => {
  return context.encryption.decryptString(raw);
});

const schema = Schema.create()
  .required('amount')
  .number('amount')
  .required('currency')
  .string('currency');

const payload = await SecurePayload.decode(rawPayload, {
  decryptor: 'payments',
  context: {
    encryption: Encryption.connection('default'),
  },
})
  .decrypt()
  .json()
  .coerce({ amount: 'number' })
  .validate(schema)
  .typed<{ amount: number; currency: string }>();
```

## Example: auth and login flow

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
  context: { requestId: req.getHeader('x-request-id') },
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

## Example: notification compose flow

```ts
import { Notification } from '@zintrust/core';

Notification.registerChannel('email', async (payload, context) => {
  return context.mailer.send(payload);
});

Notification.registerChannel('push', async (payload, context) => {
  return context.pushProvider.send(payload);
});

const result = await Notification.compose({
  context: {
    mailer: Mail.connection('default'),
    pushProvider: Push.connection('primary'),
  },
})
  .email({ to: 'account@example.com', subject: 'Operation complete', html: '<p>Completed</p>' })
  .push({
    recipientId: 'account-1',
    title: 'Operation complete',
    body: 'Your request was successful',
  })
  .required(['email'])
  .bestEffort(['push'])
  .send();

if (result.results.some((entry) => entry.channel === 'push' && entry.ok === false)) {
  Logger.warn('push delivery failed but email still sent', result.results);
}
```

## Example: context loader flow

```ts
import { ContextLoader } from '@zintrust/core';

const loader = ContextLoader.create({ mode: 'batch' }).batch(
  'profilesByUserId',
  async (userIds) => {
    const profiles = await Profile.whereIn('user_id', userIds).get();
    return new Map(profiles.map((profile) => [String(profile.user_id), profile]));
  }
);

const context = await loader
  .load('user', async () => User.find(userId))
  .load('profile', async ({ user }) => {
    const currentUser = user as { id?: string } | null;
    return currentUser?.id ? loader.fromBatch('profilesByUserId', currentUser.id) : null;
  })
  .load('wallet', async ({ user }) => {
    const currentUser = user as { id?: string } | null;
    return currentUser?.id ? Wallet.where('user_id', '=', currentUser.id).first() : null;
  })
  .resolve();
```

## Cross References

1. [authentication](/authentication)
2. [performance](/performance)
3. [notification](/notification)
4. [plug-and-play-notification-composer](/plug-and-play-notification-composer)
5. [plug-and-play-context-loader](/plug-and-play-context-loader)
