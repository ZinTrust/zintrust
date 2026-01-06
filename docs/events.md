# Events

Zintrust includes a small, framework-agnostic Events & Listeners utility you can use to decouple parts of your application.

## Basic Usage

```ts
import { EventDispatcher } from '@zintrust/core';

type AppEvents = {
  'user.created': { userId: string };
  'email.sent': { to: string; template: string };
};

const events = EventDispatcher.create<AppEvents>();

// Register a listener
const off = events.on('user.created', async ({ userId }) => {
  // ...
});

// Emit an event (sync fire-and-forget)
events.emit('user.created', { userId: '123' });

// Unregister the listener
off();
```

## Once Listeners

```ts
import { EventDispatcher } from '@zintrust/core';

type AppEvents = {
  'job.finished': { jobId: string };
};

const events = EventDispatcher.create<AppEvents>();

events.once('job.finished', ({ jobId }) => {
  // runs once
});
```

## Async Dispatch & Error Handling

- `emit()` triggers listeners immediately. If a listener returns a Promise, it is awaited in the background and failures are logged via `Logger.error`.
- `emitAsync()` awaits all listeners and throws if one or more listeners fail (multiple failures are wrapped in `AggregateError`).

```ts
import { EventDispatcher } from '@zintrust/core';

type AppEvents = {
  'invoice.paid': { invoiceId: string };
};

const events = EventDispatcher.create<AppEvents>();

events.on('invoice.paid', async () => {
  // ...
});

events.on('invoice.paid', async () => {
  throw new Error('fail');
});

await events.emitAsync('invoice.paid', { invoiceId: 'inv_1' });
```
