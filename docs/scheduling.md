# Scheduling

## What exists today

ZinTrust includes a lightweight in-process schedule runner:

- `src/scheduler/ScheduleRunner.ts`
- Types: `src/scheduler/types.ts`

It supports:

- Register schedules by name (`ISchedule`)
- Run schedules on a fixed interval (`intervalMs`)
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
- `enabledWhen(bool)`
- `runOnStart()`
- `withoutOverlapping()` (distributed lock via lock provider when available)

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
