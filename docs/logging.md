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

## Environment Configuration

Control logging behavior using environment variables:

### LOG_LEVEL

Controls the minimum log level that will be recorded. The logging system uses priority-based filtering:

```env
# Default: debug (captures all logs)
LOG_LEVEL=debug    # Captures: debug, info, warn, error
LOG_LEVEL=info     # Captures: info, warn, error
LOG_LEVEL=warn     # Captures: warn, error
LOG_LEVEL=error    # Captures: error only
```

The logger is initialized in the Application constructor with the environment setting:

```typescript
// In src/Application.ts
if (!Env.DISABLE_LOGGING) {
  Logger.initialize(undefined, undefined, undefined, Env.LOG_LEVEL);
}
```

**Development Example:**

```bash
# Development: Capture all logs including debug
export LOG_LEVEL=debug
npm run dev
```

**Production Example:**

```bash
# Production: Only capture warnings and errors
export LOG_LEVEL=warn
NODE_ENV=production npm start
```

### DISABLE_LOGGING

Completely disables the logging system. Use with caution:

```env
# Default: false (logging enabled)
DISABLE_LOGGING=true   # Disables all logging
DISABLE_LOGGING=false  # Enables logging
```

**Warning**: Disabling logging in production removes the ability to debug production issues. Only disable logging if you have alternative observability systems in place.

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

## Error Handling

Zintrust enforces a "Zero-Swallow" safety guarantee: all errors must be logged before being handled or re-thrown.

### Required Logger.error() in Catch Blocks

The ESLint rule `no-restricted-syntax` enforces that every catch block includes a `Logger.error()` call:

```typescript
// ❌ INVALID - ESLint Error
try {
  await database.query('SELECT * FROM users');
} catch (error) {
  // Missing Logger.error() call!
  return null;
}

// ✅ VALID - Compliant with safety rule
try {
  await database.query('SELECT * FROM users');
} catch (error) {
  Logger.error('Database query failed', error);
  return null;
}
```

### How Log Level Filtering Works

Important: `Logger.error()` calls are **always required** in catch blocks, regardless of `LOG_LEVEL` setting. The filtering happens **inside the Logger**, not at the call site:

```typescript
// This error WILL BE LOGGED even if LOG_LEVEL=warn
try {
  await connectDatabase();
} catch (error) {
  Logger.error('Database connection failed', error); // Always executes
}

// At runtime:
// - If LOG_LEVEL=error → This error message is recorded
// - If LOG_LEVEL=warn  → This error message is recorded (warn < error priority)
// - If LOG_LEVEL=info  → This error message is recorded
// - If LOG_LEVEL=debug → This error message is recorded
```

### Why This Matters

The safety guarantee ensures that:

1. **No Silent Failures**: Every error path includes logging
2. **Production Debugging**: Error logs are always available when needed
3. **Consistency**: All catch blocks follow the same pattern

You control **which** errors appear in production logs using `LOG_LEVEL`, but you cannot prevent an error from being logged through code—only through environment configuration.

### Example: Handling and Filtering Errors

```typescript
// Source code - always has Logger.error()
async function processPayment(userId: number) {
  try {
    return await paymentGateway.charge(userId);
  } catch (error) {
    Logger.error('Payment processing failed', error); // Always executed
    throw error; // Re-throw after logging
  }
}

// Runtime behavior:
// $ LOG_LEVEL=error   → Only payment errors appear in logs
// $ LOG_LEVEL=info    → Payment errors + info messages appear
// $ LOG_LEVEL=debug   → All details including debug logs appear
```
