# Plug & Play Notification Composer

`Notification.compose(...)` is the ZinTrust Plug & Play surface for multi-channel delivery orchestration.

It sits above notification transports so services can declare delivery intent once and keep provider-specific glue inside registered channel handlers.

## Available runtime

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

## What the core owns

`Notification.compose(...)` provides:

1. channel registration
2. one compose-and-send orchestration surface
3. required versus best-effort policy
4. normalized per-channel result objects
5. bounded builder state that is dropped after `send()` resolves or rejects

## What the application still owns

Applications still decide:

1. which channels are registered
2. how transport-specific payloads are mapped
3. which provider clients live in `context`
4. whether a failure should be marked required or best-effort

## Required vs best-effort behavior

1. required channel failures make `send()` reject with a result list attached to the error
2. best-effort channel failures stay in the resolved `result.results` array
3. successful channels always report `{ ok: true }` entries

## Custom channel example

```ts
Notification.registerChannel('slack', async (payload, context) => {
  return context.http.post(context.webhookUrl, payload);
});

await Notification.compose({
  context: {
    http: HttpClient.create(),
    webhookUrl: 'https://hooks.slack.com/services/example',
  },
})
  .channel('slack', { text: 'Queue stalled' })
  .required(['slack'])
  .send();
```

## Related docs

1. Use [notification](/notification) for transport-level notification drivers and queueing.
2. Use [plug-and-play-performance](/plug-and-play-performance) for the retention rules that keep delivery orchestration bounded.
