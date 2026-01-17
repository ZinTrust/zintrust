# @zintrust/queue-monitor

Queue monitoring scaffolding for ZinTrust.

- Docs: https://zintrust.com/queue

## Install

```bash
npm i @zintrust/queue-monitor
```

## Usage

```ts
import { QueueMonitor, type IRouter } from '@zintrust/core';
import { QueueMonitor as QueueMonitorPlugin } from '@zintrust/queue-monitor';

const monitor = QueueMonitorPlugin.create({
  basePath: '/queue-monitor',
  middleware: ['auth'],
});

export function registerRoutes(router: IRouter): void {
  monitor.registerRoutes(router);
}
```

## When to use

- ✅ Use `@zintrust/queue-monitor` if you need full queue management (enqueue + process + monitor + retry)
- ✅✅ Use `@zintrust/queue-redis` if you only need to **enqueue jobs** and another service will process them

**Note:** The monitor package can do everything queue-redis does, plus much more. So if you install `@zintrust/queue-monitor`, there's no need for `@zintrust/queue-redis`.

## License

This package and its dependencies are MIT licensed, permitting free commercial use.
