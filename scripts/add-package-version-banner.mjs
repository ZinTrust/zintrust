#!/usr/bin/env node
/**
 * Add version banner to any package's dist/index.js
 * Usage: node scripts/add-package-version-banner.mjs <package-path>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const packagePath = process.argv[2];
if (!packagePath) {
  console.error('❌ Usage: node add-package-version-banner.mjs <package-path>');
  process.exit(1);
}

const distIndexPath = path.join(packagePath, 'dist/index.js');
const packageJsonPath = path.join(packagePath, 'package.json');

if (!fs.existsSync(distIndexPath)) {
  console.error(`❌ ${distIndexPath} not found. Run build first.`);
  process.exit(1);
}

if (!fs.existsSync(packageJsonPath)) {
  console.error(`❌ ${packageJsonPath} not found.`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const buildDate = new Date().toISOString();
const nodeVersion = pkg.engines?.node || '>=20.0.0';

const banner = `/**
 * ${pkg.name} v${pkg.version}
 *
 * ${pkg.description || 'ZinTrust Framework Package'}
 *
 * Build Information:
 *   Built: ${buildDate}
 *   Node: ${nodeVersion}
 *   License: ${pkg.license || 'MIT'}
 *
 */
`;

const content = fs.readFileSync(distIndexPath, 'utf-8');

// Only add banner if not already present
if (content.includes(`${pkg.name} v`)) {
  console.log(`ℹ️  Version banner already present in ${pkg.name}`);
} else {
  fs.writeFileSync(distIndexPath, banner + content);
  console.log(`✅ Added version banner to ${pkg.name} (v${pkg.version})`);
}
