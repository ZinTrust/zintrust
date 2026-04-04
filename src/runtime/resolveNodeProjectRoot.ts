import { isNonEmptyString } from '@helper/index';

export const resolveNodeProjectRoot = async (): Promise<string> => {
  const configuredRoot = process.env?.['ZINTRUST_PROJECT_ROOT'] ?? '';
  if (isNonEmptyString(configuredRoot)) return configuredRoot.trim();

  const { existsSync } = await import('@node-singletons/fs');
  const path = await import('@node-singletons/path');

  let current = process.cwd();
  while (true) {
    if (existsSync(path.join(current, 'package.json'))) return current;

    const parent = path.dirname(current);
    if (parent === current) return process.cwd();
    current = parent;
  }
};

export default resolveNodeProjectRoot;
