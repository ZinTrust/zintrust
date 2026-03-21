#!/usr/bin/env node
/**
 * Generate build manifest for any package
 * Usage: node scripts/generate-package-manifest.mjs <package-path>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createManifest, generateFileIntegrity, getAllFiles } from './manifest-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const packagePath = process.argv[2];
if (!packagePath) {
  console.error('❌ Usage: node generate-package-manifest.mjs <package-path>');
  process.exit(1);
}

const distPath = path.join(packagePath, 'dist');
const packageJsonPath = path.join(packagePath, 'package.json');
const manifestPath = path.join(distPath, 'build-manifest.json');

if (!fs.existsSync(distPath)) {
  console.error(`❌ ${distPath} not found. Run build first.`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

const manifest = createManifest(
  pkg,
  {
    engines: pkg.engines,
    dependencies: Object.keys(pkg.dependencies || {}),
    peerDependencies: Object.keys(pkg.peerDependencies || {}),
  },
  generateFileIntegrity(distPath, getAllFiles(distPath))
);

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`✅ Generated build manifest for ${pkg.name}`);
console.log(`   Version: ${manifest.version}`);
console.log(`   Commit: ${manifest.git.commit}`);
console.log(`   Files: ${Object.keys(manifest.files).length}`);
