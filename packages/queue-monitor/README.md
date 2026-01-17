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

## License

This package and its dependencies are MIT licensed, permitting free commercial use.
