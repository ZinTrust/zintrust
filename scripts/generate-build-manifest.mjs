#!/usr/bin/env node
/**
 * Generate build manifest with metadata and file integrity hashes
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createManifest, generateFileIntegrity, getAllFiles } from './manifest-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '../dist');
const packagePath = path.join(distPath, 'package.json');
const manifestPath = path.join(distPath, 'build-manifest.json');

if (!fs.existsSync(distPath)) {
  console.error('❌ dist/ not found. Run build first.');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

const srcPath = path.join(distPath, 'src');

const manifest = createManifest(
  pkg,
  {
    engines: pkg.engines,
    dependencies: Object.keys(pkg.dependencies || {}),
  },
  fs.existsSync(srcPath) ? generateFileIntegrity(distPath, getAllFiles(srcPath)) : {}
);

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`✅ Generated build manifest: ${manifestPath}`);
console.log(`   Version: ${manifest.version}`);
console.log(`   Commit: ${manifest.git.commit}`);
console.log(`   Files: ${Object.keys(manifest.files).length}`);
