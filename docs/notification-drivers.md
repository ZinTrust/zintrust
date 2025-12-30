# Notification Drivers

This document describes supported notification drivers and configuration.

## Termii SMS Driver 🔹

Environment variables:

- `TERMII_API_KEY` (required)
- `TERMII_SENDER` (optional, default: `Zintrust`)

Usage example:

```ts
import { TermiiDriver } from '@notification/drivers/Termii';
await TermiiDriver.send('+1234567890', 'Your code is 1234');
```

Notes:

- The implementation uses `globalThis.fetch` so it can be mocked in tests.
- Driver throws a `ConfigError` when `TERMII_API_KEY` is not set.
- Consider adding retry/backoff and metrics in production use.
