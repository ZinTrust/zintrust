# Scheduling

## What exists today

ZinTrust includes a lightweight in-process schedule runner:

- `src/scheduler/ScheduleRunner.ts`
- Types: `src/scheduler/types.ts`

It supports:

- Register schedules by name (`ISchedule`)
- Run schedules on a fixed interval (`intervalMs`)
- Run schedules using a 5-field cron expression (minute-resolution)
- Timezone evaluation for cron via `Intl.DateTimeFormat` (IANA timezone strings)
- Jitter (`jitterMs`) and failure backoff (`backoff`) for next-run scheduling
- Optional `runOnStart`
- In-process overlap prevention (won't run the same schedule concurrently within a single process)
- Manual invocation via `runOnce(name)`

## What was missing (now added)

### Developer schedule location

Project schedules live in:

- `app/Schedules/index.ts` (your app space; single entry file)

If a schedule exists in both core and app with the same `name`, **app wins** (it overrides the core schedule).

Export schedules from:

- `app/Schedules/index.ts`

### Schedule DSL

Use the builder in `src/scheduler/Schedule.ts` (importable via `@scheduler/Schedule`):

In `app/Schedules/index.ts` you typically start with:

```ts
import { Schedule } from '@scheduler/Schedule';
```

- `Schedule.define(name, handler)`
- `everyMinute()` / `everyMinutes(n)`
- `everyHour()` / `everyHours(n)`
- `intervalMs(ms)`
- `cron(expr, { timezone? })`
- `timezone(tz)`
- `jitterMs(ms)`
- `backoff({ initialMs, maxMs, factor? })`
- `leaderOnly()` (metadata for coordination)
- `enabledWhen(bool)`
- `runOnStart()`
- `withoutOverlapping()` (distributed lock via lock provider when available)

### Examples (copy/paste)

Below are practical examples you can drop into files like `app/Schedules/*.ts` and then export from `app/Schedules/index.ts`.

#### 1) Every minute (cron, UTC)

```ts
import { Schedule } from '@scheduler/Schedule';
import { Logger } from '@config/logger';

export default Schedule.define('demo.everyMinute', async () => {
  Logger.info('demo.everyMinute fired', { at: new Date().toISOString() });
})
  .cron('* * * * *', { timezone: 'UTC' })
  .build();
```

#### 2) Every 5 minutes (cron)

```ts
import { Schedule } from '@scheduler/Schedule';
import { Logger } from '@config/logger';

export default Schedule.define('demo.every5Minutes', async () => {
  Logger.info('demo.every5Minutes fired', { at: new Date().toISOString() });
})
  .cron('*/5 * * * *', { timezone: 'UTC' })
  .build();
```

#### 3) Daily at midnight (timezone-aware)

```ts
import { Schedule } from '@scheduler/Schedule';
import { Logger } from '@config/logger';

export default Schedule.define('demo.midnightNy', async () => {
  Logger.info('demo.midnightNy fired', { at: new Date().toISOString() });
})
  .cron('0 0 * * *', { timezone: 'America/New_York' })
  .build();
```

#### 4) Weekdays at 09:30 (Mon–Fri)

```ts
import { Schedule } from '@scheduler/Schedule';
import { Logger } from '@config/logger';

export default Schedule.define('demo.weekdays0930', async () => {
  Logger.info('demo.weekdays0930 fired', { at: new Date().toISOString() });
})
  .cron('30 9 * * 1-5', { timezone: 'UTC' })
  .build();
```

#### 5) Interval scheduling (every 10 minutes)

```ts
import { Schedule } from '@scheduler/Schedule';
import { Logger } from '@config/logger';

export default Schedule.define('demo.every10MinInterval', async () => {
  Logger.info('demo.every10MinInterval fired', { at: new Date().toISOString() });
})
  .everyMinutes(10)
  .build();
```

#### 6) Run on process start (then continue on interval)

```ts
import { Schedule } from '@scheduler/Schedule';
import { Logger } from '@config/logger';

export default Schedule.define('demo.runOnStartThenHourly', async () => {
  Logger.info('demo.runOnStartThenHourly fired', { at: new Date().toISOString() });
})
  .runOnStart()
  .everyHour()
  .build();
```

#### 7) Add jitter (spread load)

```ts
import { Schedule } from '@scheduler/Schedule';
import { Logger } from '@config/logger';

export default Schedule.define('demo.jitteredCron', async () => {
  Logger.info('demo.jitteredCron fired', { at: new Date().toISOString() });
})
  .cron('*/1 * * * *', { timezone: 'UTC' })
  .jitterMs(15_000) // add 0..15s random delay to each run
  .build();
```

#### 8) Backoff on failure (retry slower when it keeps failing)

```ts
import { Schedule } from '@scheduler/Schedule';
import { Logger } from '@config/logger';

export default Schedule.define('demo.backoffOnFailure', async () => {
  Logger.info('demo.backoffOnFailure fired', { at: new Date().toISOString() });
  // throw new Error('simulate failure');
})
  .everyMinute()
  .backoff({ initialMs: 5_000, maxMs: 60_000, factor: 2 })
  .build();
```

#### 9) Prevent overlap across instances (distributed lock)

```ts
import { Schedule } from '@scheduler/Schedule';
import { Logger } from '@config/logger';

export default Schedule.define('demo.noOverlap', async () => {
  Logger.info('demo.noOverlap fired', { at: new Date().toISOString() });
})
  .everyMinutes(5)
  .withoutOverlapping({ provider: 'redis', ttlMs: 5 * 60_000 })
  .build();
```

#### 10) Manual-only schedule (no cron/interval)

This schedule will NOT auto-run. Invoke it via:

- `zin schedule:run --name demo.manualOnly`
- or schedule RPC action `run`

```ts
import { Schedule } from '@scheduler/Schedule';
import { Logger } from '@config/logger';

export default Schedule.define('demo.manualOnly', async () => {
  Logger.info('demo.manualOnly fired', { at: new Date().toISOString() });
}).build();
```

### HTTP schedule gateway (for Docker/Workers-style cron)

The API server exposes a signed internal endpoint:

- `POST /api/_sys/schedule/rpc`

Actions:

- `list`
- `run` (by schedule name)

Signing uses the same `SignedRequest` scheme as the queue gateway.

### CLI

- `zin schedule:list`
- `zin schedule:run --name <schedule>`

`schedule:list` includes best-effort runtime state (when available):

- `lastSuccessAt`, `lastErrorAt`, `nextRunAt`, `consecutiveFailures`

## Leader gating (multi-instance)

To ensure only one instance is actively scheduling timers (recommended when you run multiple replicas), enable leader lease gating:

- `SCHEDULE_LEADER_ENABLED=true`
