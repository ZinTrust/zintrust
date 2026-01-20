# ZinTrust Telemetry Dashboard

A lightweight dashboard package for visualizing worker telemetry from ZinTrust services.

## Usage

```ts
import { TelemetryDashboard } from '@zintrust/telemetry-dashboard';

const dashboard = TelemetryDashboard.create({
  basePath: '/telemetry',
});

dashboard.registerRoutes(router);
```

## Environment

- `WORKER_API_URL` (optional): Points to the worker API service.
- `HOST` (fallback): Used when `WORKER_API_URL` is not set.

## Development

```bash
npm run build
```
