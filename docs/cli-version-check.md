# CLI Version Check Feature

The ZinTrust CLI includes an automatic version check feature that notifies users when a newer version of the framework is available.

## How It Works

When you run any ZinTrust CLI command (except version and help commands), the CLI automatically checks if there's a newer version available from the npm registry. If an update is found, you'll see a notification like:

```
⚠️  Update Available
┌──────────────────────────────────────────────────┐
│ Current:  0.1.25                                │
│ Latest:   0.1.26                                │
└──────────────────────────────────────────────────┘

💡 Update to get the latest features and bug fixes:
   npm install -g @zintrust/core@0.1.26
   or: npx @zintrust/core@latest [command]

🔧 To disable version checks:
   export ZINTRUST_VERSION_CHECK=false
```

## Configuration

You can control the version check behavior using environment variables:

### Enable/Disable Version Check

```bash
# Disable version checks
export ZINTRUST_VERSION_CHECK=false

# Enable version checks (default)
export ZINTRUST_VERSION_CHECK=true
```

### Check Interval

Control how often the CLI checks for updates (in hours):

```bash
# Check every 12 hours
export ZINTRUST_VERSION_CHECK_INTERVAL=12

# Check every 24 hours (default)
export ZINTRUST_VERSION_CHECK_INTERVAL=24

# Check every week
export ZINTRUST_VERSION_CHECK_INTERVAL=168
```

### Skip Version Check

Temporarily skip the version check for a single command:

```bash
# Skip version check for this command only
ZINTRUST_SKIP_VERSION_CHECK=true zin start
```

## Behavior Details

### When Version Check Runs

The version check runs when:
- You execute any CLI command except `-v`, `--version`, or `help`
- Version checking is enabled (default)
- The check interval has passed since the last check
- You haven't explicitly skipped the check

### When Version Check is Skipped

The version check is skipped when:
- Running version commands (`-v`, `--version`, `help`)
- Version checking is disabled via `ZINTRUST_VERSION_CHECK=false`
- You explicitly skip with `ZINTRUST_SKIP_VERSION_CHECK=true`
- The check interval hasn't passed yet
- Network issues prevent reaching the npm registry

### Network Behavior

- Version checks use a 5-second timeout to avoid blocking CLI usage
- If the network request fails, the CLI continues normally without showing errors
- Version check results are cached using localStorage to avoid repeated requests

### Privacy

- Version checks only fetch version information from the public npm registry
- No personal data or usage information is collected
- Only the package name and version information are requested

## Implementation Details

The version check feature is implemented in:

- **Service**: `src/cli/services/VersionChecker.ts`
- **Integration**: `src/cli/CLI.ts` (integrated into CLI startup)
- **Tests**: `tests/unit/cli/services/VersionChecker.test.ts`

### Key Features

- **Non-blocking**: Version checks run in the background and don't delay CLI execution
- **Graceful degradation**: Network failures don't crash the CLI
- **Configurable**: Full control over check behavior via environment variables
- **Smart caching**: Avoids unnecessary network requests
- **User-friendly**: Clear, actionable update notifications

## Examples

### Basic Usage

```bash
# Normal command - will check for updates if needed
zin start

# Version command - no version check
zin --version

# Help command - no version check
zin help
```

### Disable Version Check

```bash
# Permanently disable (add to shell profile)
export ZINTRUST_VERSION_CHECK=false

# Temporarily disable for one command
ZINTRUST_SKIP_VERSION_CHECK=true zin start
```

### Custom Check Interval

```bash
# Check for updates every hour
export ZINTRUST_VERSION_CHECK_INTERVAL=1

# Check once per day (default)
export ZINTRUST_VERSION_CHECK_INTERVAL=24
```

## Troubleshooting

### Version Check Not Working

1. Check if version checking is enabled:
   ```bash
   echo $ZINTRUST_VERSION_CHECK
   ```

2. Verify network connectivity to npm registry:
   ```bash
   curl https://registry.npmjs.org/@zintrust/core/latest
   ```

3. Clear the version check cache:
   ```bash
   # Remove localStorage entry (browser/Node.js specific)
   ```

### Too Many Notifications

1. Increase the check interval:
   ```bash
   export ZINTRUST_VERSION_CHECK_INTERVAL=168  # Weekly
   ```

2. Or disable entirely:
   ```bash
   export ZINTRUST_VERSION_CHECK=false
   ```

### Network Issues

If you're behind a corporate firewall or proxy, the version check might fail. The CLI will continue to work normally, but you can disable the check if needed:

```bash
export ZINTRUST_VERSION_CHECK=false
```
