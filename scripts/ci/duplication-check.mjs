import { execSync } from 'node:child_process';

function getStagedFiles() {
  const out = execSync('git diff --cached --name-only --diff-filter=ACM', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isRelevantPath(filePath) {
  if (
    filePath.startsWith('tests/') ||
    filePath.startsWith('dist/') ||
    filePath.startsWith('coverage/') ||
    filePath.startsWith('tmp/') ||
    filePath.startsWith('tmp-test-logs/') ||
    filePath.startsWith('docs-website/public/')
  ) {
    return false;
  }

  return /\.(ts|tsx|js|mjs|cjs)$/.test(filePath);
}

const threshold = Number.parseFloat(process.env.DUPLICATION_THRESHOLD ?? '5');
const minLines = Number.parseInt(process.env.DUPLICATION_MIN_LINES ?? '5', 10);
const minTokens = Number.parseInt(process.env.DUPLICATION_MIN_TOKENS ?? '70', 10);

const staged = getStagedFiles().filter(isRelevantPath);

// If there's only 0-1 file, duplication on “new code” is meaningless.
if (staged.length < 2) {
  process.exit(0);
}

const cmd = [
  'npx',
  'jscpd',
  '--threshold',
  String(threshold),
  '--min-lines',
  String(minLines),
  '--min-tokens',
  String(minTokens),
  '--reporters',
  'console',
  '--format',
  'typescript,javascript',
  '--ignore',
  '"**/dist/**,**/coverage/**,**/tmp/**,**/tmp-test-logs/**,**/docs-website/public/**/tests/**"',
  ...staged.map((p) => `"${p}"`),
].join(' ');

try {
  execSync(cmd, { stdio: 'inherit' });
} catch {
  // jscpd returns non-zero when threshold is exceeded.
  process.exit(1);
}
