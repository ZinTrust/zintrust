import { SpawnUtil } from '@cli/utils/spawn';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as path from '@node-singletons/path';

type NumberExpectation = 'positive' | 'non-negative';

export const parseIntOption = (
  raw: string | undefined,
  name: string,
  expectation: NumberExpectation = 'positive'
): number | undefined => {
  if (raw === undefined) return undefined;

  const parsed = Number.parseInt(raw, 10);
  const isValid =
    expectation === 'non-negative'
      ? Number.isFinite(parsed) && parsed >= 0
      : Number.isFinite(parsed) && parsed > 0;

  if (!isValid) {
    const expected = expectation === 'non-negative' ? 'a non-negative number' : 'a positive number';
    throw ErrorFactory.createCliError(`Invalid --${name} '${raw}'. Expected ${expected}.`);
  }

  return parsed;
};

export const trimOption = (value: string | undefined): string | undefined => value?.trim();

const isWatchChild = (): boolean => process.env['ZINTRUST_PROXY_WATCH_CHILD'] === '1';

const buildWatchArgs = (): string[] => {
  const rawArgs = process.argv.slice(2);
  const filtered = rawArgs.filter((arg) => arg !== '--watch');
  return ['watch', path.join('bin', 'zin.ts'), ...filtered];
};

export const maybeRunProxyWatchMode = async (watch: boolean | undefined): Promise<void> => {
  if (watch !== true || isWatchChild()) return;

  const args = buildWatchArgs();
  const exitCode = await SpawnUtil.spawnAndWait({
    command: 'tsx',
    args,
    env: {
      ...process.env,
      ZINTRUST_PROXY_WATCH_CHILD: '1',
    },
    forwardSignals: false,
  });

  process.exit(exitCode);
};
