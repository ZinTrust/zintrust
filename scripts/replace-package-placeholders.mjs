#!/usr/bin/env node
/**
 * Replace build placeholders in any package's compiled files
 * Usage: node scripts/replace-package-placeholders.mjs <package-path>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const packagePath = process.argv[2];
if (!packagePath) {
  console.error('❌ Usage: node replace-package-placeholders.mjs <package-path>');
  process.exit(1);
}

const distIndexPath = path.join(packagePath, 'dist/index.js');
const packageJsonPath = path.join(packagePath, 'package.json');

if (!fs.existsSync(distIndexPath)) {
  console.error(`❌ ${distIndexPath} not found`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const buildDate = new Date().toISOString();
let content = fs.readFileSync(distIndexPath, 'utf-8');

// Replace placeholders
content = content.replaceAll('__BUILD_DATE__', buildDate);
content = content.replaceAll('__PACKAGE_VERSION__', pkg.version);
content = content.replaceAll('__PACKAGE_NAME__', pkg.name);

fs.writeFileSync(distIndexPath, content);
console.log(`✅ Replaced build placeholders for ${pkg.name}`);
console.log(`   BUILD_DATE: ${buildDate}`);
console.log(`   VERSION: ${pkg.version}`);
