import { spawnSync } from 'node:child_process';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function isTruthy(value) {
  if (typeof value !== 'string') return false;
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

function createWranglerEnv(env) {
  const keepApiToken = isTruthy(env.ZIN_WRANGLER_KEEP_API_TOKEN);
  const isCi = env.CI === 'true' || env.CI === '1';

  if (keepApiToken || isCi || typeof env.CLOUDFLARE_API_TOKEN !== 'string') {
    return env;
  }

  process.stderr.write(
    '[wrangler-local] Ignoring CLOUDFLARE_API_TOKEN for this local Wrangler command. Wrangler 4.92+ can reject interactive OAuth when that variable is exported. Set ZIN_WRANGLER_KEEP_API_TOKEN=true to preserve token-based auth.\n'
  );

  const nextEnv = { ...env };
  delete nextEnv.CLOUDFLARE_API_TOKEN;
  return nextEnv;
}

const argv = process.argv.slice(2);
const separatorIndex = argv.indexOf('--');
const optionArgs = separatorIndex >= 0 ? argv.slice(0, separatorIndex) : argv;
const commandArgs = separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : [];

let cwd = process.cwd();

for (let index = 0; index < optionArgs.length; index += 1) {
  const current = optionArgs[index];
  if (current === '--cwd') {
    const value = optionArgs[index + 1];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error('Missing value for --cwd');
    }

    cwd = value;
    index += 1;
    continue;
  }

  throw new Error(`Unknown option: ${current}`);
}

if (commandArgs.length === 0) {
  throw new Error(
    'Usage: node scripts/run-local-wrangler.mjs [--cwd <path>] -- <command> [args...]'
  );
}

const [command, ...args] = commandArgs;
const result = spawnSync(command, args, {
  cwd,
  stdio: 'inherit',
  env: createWranglerEnv(process.env),
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
