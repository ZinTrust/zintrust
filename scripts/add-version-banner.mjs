#!/usr/bin/env node
/**
 * Add version banner to dist/src/index.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distIndexPath = path.join(__dirname, '../dist/src/index.js');
const packagePath = path.join(__dirname, '../dist/package.json');

if (!fs.existsSync(distIndexPath)) {
  console.error('❌ dist/src/index.js not found. Run build first.');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
const buildDate = new Date().toISOString();
const nodeVersion = pkg.engines?.node || '>=20.0.0';

const banner = `/**
 * @zintrust/core v${pkg.version}
 *
 * ZinTrust Framework - Production-Grade TypeScript Backend
 * Built for performance, type safety, and exceptional developer experience
 *
 * Build Information:
 *   Built: ${buildDate}
 *   Node: ${nodeVersion}
 *   License: MIT
 *
 * Copyright (c) ${new Date().getFullYear()} ZinTrust
 * https://zintrust.com
 */
`;

const content = fs.readFileSync(distIndexPath, 'utf-8');

// Only add banner if not already present
if (content.includes('@zintrust/core v')) {
  console.log('ℹ️  Version banner already present');
} else {
  fs.writeFileSync(distIndexPath, banner + content);
  console.log(`✅ Added version banner to dist/src/index.js (v${pkg.version})`);
}
