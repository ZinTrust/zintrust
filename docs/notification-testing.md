# Notification Testing Helpers

This document describes the helper utilities available for testing notifications.

## useFakeDriver(name)

Registers a fake driver under the provided name and sets the `NOTIFICATION_DRIVER` env var to that name.

Example:

```ts
const helper = useFakeDriver('fake-sms');
// run code that sends notifications
helper.restore();
```

Notes:

- The helper restores previous configuration and the `NOTIFICATION_DRIVER` env var when `restore()` is called.
- Use `NotificationFake` to assert on sent messages in tests.
