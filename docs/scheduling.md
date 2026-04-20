# Scheduling

ZinTrust includes a lightweight, flexible schedule runner built directly into the framework. It handles recurrent background tasks, cron jobs, and interval-based execution without requiring external daemon processes.

The scheduler supports:

- Registering schedules by name
- Fixed interval execution (`intervalMs`)
- Cron expressions with minute-resolution
- Timezone-aware cron evaluation (IANA timezone strings)
- Jitter (`jitterMs`) to spread execution loads
- Failure backoff scheduling
- Optional execution on process start
- In-process overlap prevention (prevents concurrent runs in the same process)
- Distributed locking (`withoutOverlapping()`) across multiple instances
- Manual invocation

## Location and Registration

Project schedules live in your application space. You export them from a central entry file at `app/Schedules/index.ts`.

> **Note:** If a schedule defined in your application uses the same name as a built-in core schedule, the application schedule will override the core schedule.

Use the `Schedule` builder imported from `@zintrust/core` to define your tasks. In `app/Schedules/index.ts` you typically begin with:

```ts
import { Logger, Schedule } from '@zintrust/core';
```

### Available Builder Methods

- `Schedule.define(name, handler)`: Starts the definition of a new schedule.
- `everyMinute()` / `everyMinutes(n)`: Run on a fixed minute cadence.
- `everyHour()` / `everyHours(n)`: Run on a fixed hourly cadence.
- `intervalMs(ms)`: Run on a strictly defined millisecond interval.
- `cron(expr, { timezone? })`: Run on a standard 5-field cron schedule.
- `timezone(tz)`: Set the timezone for the execution.
- `jitterMs(ms)`: Adds a random delay between 0 and `ms` before running, spreading out load.
- `backoff({ initialMs, maxMs, factor? })`: Exponentially slows down retries if the schedule throws an error.
- `leaderOnly()`: Only runs if the current instance holds the schedule leader lease.
- `enabledWhen(bool)`: Conditionally enables or disables the schedule.
- `runOnStart()`: Runs immediately when the application boots, and then follows its standard schedule.
- `withoutOverlapping({ provider, ttlMs })`: Prevents overlapping runs across multiple server instances using a distributed lock.

---

## Enabling the Scheduler

Schedules require two things to run: the `SCHEDULES_ENABLED` environment variable set to `true`, and an explicit `zin schedule:start` command. The two are kept separate by design — `zin s` runs the HTTP server and `zin schedule:start` runs the schedule daemon as its own long-running process.

```bash
# Terminal 1 — HTTP server
zin s

# Terminal 2 (or a separate container/process) — schedule daemon
zin schedule:start
```

Set the environment variable to allow `zin schedule:start` to proceed:

```env
SCHEDULES_ENABLED=true
```

**When `SCHEDULES_ENABLED=false` (the default):**

- `zin schedule:start` exits immediately without starting any timers.
- Schedules are still registered and **can still be triggered manually** via the CLI (`zin schedule:run`) or the HTTP RPC gateway (`POST /api/_sys/schedule/rpc`).
- `zin schedule:list` continues to work.

**When `SCHEDULES_ENABLED=true`:**

- `zin schedule:start` proceeds to register and run all schedules on their defined cadence.
- The daemon stays alive until it receives `SIGTERM` or `SIGINT`, then shuts down gracefully.
- Only supported in long-running runtimes: **Node.js** and **Fargate**. Cloudflare Workers do not support `zin schedule:start` — use the HTTP RPC gateway instead.

> **Typical production setup:** Keep `SCHEDULES_ENABLED=false` in your web/API process and set `SCHEDULES_ENABLED=true` only in a dedicated schedules container. The generated `docker-compose.schedules.yml` already reflects this split.

---

## Examples

Below are practical examples you can drop into individual files (e.g., `app/Schedules/MySchedule.ts`) and then export from `app/Schedules/index.ts`.

#### 1) Every minute (cron, UTC)

```ts
import { Logger, Schedule } from '@zintrust/core';

export default Schedule.define('demo.everyMinute', async () => {
  Logger.info('demo.everyMinute fired', { at: new Date().toISOString() });
})
  .cron('* * * * *', { timezone: 'UTC' })
  .build();
```

#### 2) Every 5 minutes (cron)

```ts
import { Logger, Schedule } from '@zintrust/core';

export default Schedule.define('demo.every5Minutes', async () => {
  Logger.info('demo.every5Minutes fired');
})
  .cron('*/5 * * * *', { timezone: 'UTC' })
  .build();
```

#### 3) Daily at midnight (timezone-aware)

```ts
import { Logger, Schedule } from '@zintrust/core';

export default Schedule.define('demo.midnightNy', async () => {
  Logger.info('demo.midnightNy fired');
})
  .cron('0 0 * * *', { timezone: 'America/New_York' })
  .build();
```

#### 4) Weekdays at 09:30 (Mon–Fri)

```ts
import { Logger, Schedule } from '@zintrust/core';

export default Schedule.define('demo.weekdays0930', async () => {
  Logger.info('demo.weekdays0930 fired');
})
  .cron('30 9 * * 1-5', { timezone: 'UTC' })
  .build();
```

#### 5) Interval scheduling (every 10 minutes)

```ts
import { Logger, Schedule } from '@zintrust/core';

export default Schedule.define('demo.every10MinInterval', async () => {
  Logger.info('demo.every10MinInterval fired');
})
  .everyMinutes(10)
  .build();
```

#### 6) Run on process start (then continue on interval)

```ts
import { Logger, Schedule } from '@zintrust/core';

export default Schedule.define('demo.runOnStartThenHourly', async () => {
  Logger.info('demo.runOnStartThenHourly fired');
})
  .runOnStart()
  .everyHour()
  .build();
```

#### 7) Add jitter (spread load)

```ts
import { Logger, Schedule } from '@zintrust/core';

export default Schedule.define('demo.jitteredCron', async () => {
  Logger.info('demo.jitteredCron fired');
})
  .cron('*/1 * * * *', { timezone: 'UTC' })
  .jitterMs(15_000) // add 0..15s random delay to each run
  .build();
```

#### 8) Backoff on failure (retry slower when failing)

```ts
import { Logger, Schedule } from '@zintrust/core';

export default Schedule.define('demo.backoffOnFailure', async () => {
  Logger.info('demo.backoffOnFailure fired');
  // throw new Error('simulate failure');
})
  .everyMinute()
  .backoff({ initialMs: 5_000, maxMs: 60_000, factor: 2 })
  .build();
```

#### 9) Prevent overlap across instances (distributed lock)

If your application runs across multiple instances, use `withoutOverlapping` to ensure a task only runs on one server at a time.

```ts
import { Logger, Schedule } from '@zintrust/core';

export default Schedule.define('demo.noOverlap', async () => {
  Logger.info('demo.noOverlap fired');
})
  .everyMinutes(5)
  .withoutOverlapping({ provider: 'redis', ttlMs: 5 * 60_000 })
  .build();
```

#### 10) Manual-only schedule

This schedule will NOT auto-run. You must invoke it manually via CLI or RPC.

```ts
import { Logger, Schedule } from '@zintrust/core';

export default Schedule.define('demo.manualOnly', async () => {
  Logger.info('demo.manualOnly fired');
}).build();
```

## HTTP Schedule Gateway

When deploying to serverless or containerized environments (like Cloudflare Workers or Docker), the system needs a way to remotely trigger schedules.

The API exposes a signed endpoint for managing and triggering schedules:

- `POST /api/_sys/schedule/rpc`

Supported actions:

- `list`: Retrieve registered schedules.
- `run`: Trigger a schedule by name.

Requests to this endpoint must be signed using the `SignedRequest` scheme (the same signature implementation used by the queue gateway).

## CLI Management

You can inspect and execute schedules from the command line:

To view all schedules and their state:

```bash
zin schedule:list
```

> **Note:** `schedule:list` includes best-effort runtime states, including `lastSuccessAt`, `lastErrorAt`, `nextRunAt`, and `consecutiveFailures`.

To run a specific schedule immediately:

```bash
zin schedule:run --name demo.manualOnly
```

## Multi-Instance Leader Gating

If you run multiple instances of your application, you can ensure only one instance actively dispatches scheduled timers by enabling leader lease gating in your environment configuration:

```env
SCHEDULE_LEADER_ENABLED=true
```
