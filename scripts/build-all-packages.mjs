#!/usr/bin/env node
/**
 * Build all packages with version banners and manifests
 */
import { execSync } from 'node:child_process';
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

console.log(`\n📦 Found ${packages.length} packages to build:\n`);
packages.forEach((pkg) => console.log(`   - ${pkg}`));
console.log();

const failed = [];

for (const pkg of packages) {
  const pkgPath = path.join(packagesDir, pkg);
  const pkgJsonPath = path.join(pkgPath, 'package.json');
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));

  console.log(`\n🔨 Building ${pkgJson.name}...`);

  try {
    // Check if package has build script
    if (pkgJson.scripts?.build) {
      // Run build from package directory
      execSync('npm run build', {
        cwd: pkgPath,
        stdio: 'inherit',
      });

      // Add version banner
      try {
        execSync(
          `node ${path.join(rootDir, 'scripts/add-package-version-banner.mjs')} ${pkgPath}`,
          {
            stdio: 'inherit',
          }
        );
      } catch {
        console.warn(`⚠️  Could not add banner to ${pkgJson.name}`);
      }

      // Replace placeholders
      try {
        execSync(
          `node ${path.join(rootDir, 'scripts/replace-package-placeholders.mjs')} ${pkgPath}`,
          {
            stdio: 'inherit',
          }
        );
      } catch (err) {
        // Handle the error by logging details to aid debugging
        console.warn(
          `⚠️  Could not replace placeholders in ${pkgJson.name}: ${err?.message ?? err}`
        );
        if (err && err.stack) {
          console.debug(err.stack);
        }
      }

      // Generate manifest
      try {
        execSync(`node ${path.join(rootDir, 'scripts/generate-package-manifest.mjs')} ${pkgPath}`, {
          stdio: 'inherit',
        });
      } catch {
        console.warn(`⚠️  Could not generate manifest for ${pkgJson.name}`);
      }

      console.log(`✅ ${pkgJson.name} built successfully`);
    } else {
      console.log(`⏭️  ${pkgJson.name} has no build script, skipping`);
    }
  } catch (error) {
    console.error(`❌ Failed to build ${pkgJson.name}:`, error.message);
    failed.push(pkgJson.name);
  }
}

console.log('\n' + '='.repeat(60));
if (failed.length === 0) {
  console.log(`✅ All ${packages.length} packages built successfully!`);
} else {
  console.log(
    `⚠️  ${packages.length - failed.length}/${packages.length} packages built successfully`
  );
  console.log(`❌ Failed packages: ${failed.join(', ')}`);
  process.exit(1);
}
