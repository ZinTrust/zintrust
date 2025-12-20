# Logging

Zintrust features a robust, file-based logging system that helps you monitor your application and debug issues.

## Basic Usage

Use the `Logger` class to record information:

```typescript
import { Logger } from '@config/logger';

Logger.info('User logged in', { userId: 1 });
Logger.error('Database connection failed', { error: err.message });
Logger.debug('Query executed', { sql: query });
```

## Log Levels

Zintrust supports standard log levels:

- `debug`: Detailed information for debugging.
- `info`: General application events.
- `warn`: Exceptional events that are not errors.
- `error`: Runtime errors that require attention.

## Log Files

Logs are stored in the `logs/` directory:

- `logs/app/`: General application logs.
- `logs/errors/`: Error-specific logs.
- `logs/cli/`: CLI command execution logs.
- `logs/migrations/`: Database migration logs.

## Log Rotation

Zintrust automatically rotates log files daily or when they reach a certain size (default 10MB), keeping your disk space usage under control.

## Viewing Logs

You can view and tail logs using the CLI:

```bash
# View recent logs
zin logs

# Tail logs in real-time
zin logs --follow

# Filter by level
zin logs --level error
```
