import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();

const targets = [
  path.join(cwd, 'src', 'zintrust.plugins.ts'),
  path.join(cwd, 'src', 'zintrust.plugins.wg.ts'),
];

const makeContent = (filename) => `/**
 * Auto-generated fallback module.
 * This file is created by scripts/ensure-worker-plugins.mjs when missing.
 * It allows optional runtime plugin imports to resolve in CI/scaffolded setups.
 */

export const __zintrustGeneratedPluginStub = '${filename}';
export default {};
`;

for (const target of targets) {
  if (fs.existsSync(target)) continue;

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, makeContent(path.basename(target)), 'utf8');
  console.log(`✅ Generated missing plugin stub: ${path.relative(cwd, target)}`);
}
