#!/usr/bin/env node
/**
 * Add version exports to all package index files
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const packagesDir = path.join(rootDir, 'packages');

if (!fs.existsSync(packagesDir)) {
  console.error('❌ packages/ directory not found');
  process.exit(1);
}

const packages = fs.readdirSync(packagesDir).filter((name) => {
  const pkgPath = path.join(packagesDir, name);
  return fs.statSync(pkgPath).isDirectory() && fs.existsSync(path.join(pkgPath, 'package.json'));
});

console.log(`\n📦 Adding version exports to ${packages.length} packages:\n`);

for (const pkg of packages) {
  const pkgPath = path.join(packagesDir, pkg);
  const pkgJsonPath = path.join(pkgPath, 'package.json');
  const indexPath = path.join(pkgPath, 'src/index.ts');

  if (!fs.existsSync(indexPath)) {
    console.log(`⏭️  ${pkg}: No src/index.ts, skipping`);
    continue;
  }

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  let content = fs.readFileSync(indexPath, 'utf-8');

  // Check if version exports already exist
  const packageNameUpper = pkgJson.name.replaceAll(/[@\\/-]/g, '_').toUpperCase();
  const versionConstName = `${packageNameUpper}_VERSION`;
  const buildDateConstName = `${packageNameUpper}_BUILD_DATE`;

  if (content.includes(versionConstName)) {
    console.log(`ℹ️  ${pkg}: Version exports already present`);
    continue;
  }

  const versionExports = `
/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const ${versionConstName} = '${pkgJson.version}';
export const ${buildDateConstName} = '__BUILD_DATE__';
`;

  // Add at the end of the file
  content = content.trimEnd() + '\n' + versionExports;

  fs.writeFileSync(indexPath, content);
  console.log(`✅ ${pkg}: Added version exports (${versionConstName}, ${buildDateConstName})`);
}

console.log('\n✨ Done! Version exports added to all packages.');
