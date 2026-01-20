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

const args = process.argv.slice(2);
const getArg = (flag) => {
  const direct = args.find((arg) => arg.startsWith(`${flag}=`));
  if (direct) return direct.slice(flag.length + 1);
  const idx = args.indexOf(flag);
  if (idx !== -1) return args[idx + 1];
  return undefined;
};

let buildAll = args.includes('--all');
const packageSelector =
  getArg('--package') ?? getArg('--pkg') ?? process.env.PACKAGE ?? process.env.npm_config_package;

if (!buildAll && !packageSelector && process.env.CI === 'true') {
  buildAll = true;
}

if (!buildAll && !packageSelector) {
  console.error('❌ Provide --package <folder|name> or use --all');
  process.exit(1);
}

const resolvePackage = (selector) => {
  if (!selector) return [];
  const matchByDir = packages.find((name) => name === selector);
  if (matchByDir) return [matchByDir];
  const matchByName = packages.find((name) => {
    const pkgPath = path.join(packagesDir, name, 'package.json');
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkgJson.name === selector;
  });
  return matchByName ? [matchByName] : [];
};

const selectedPackages = buildAll ? packages : resolvePackage(packageSelector);

if (selectedPackages.length === 0) {
  console.error(`❌ Package not found: ${packageSelector}`);
  process.exit(1);
}

const ensureCoreDist = () => {
  if (process.env.SKIP_CORE_BUILD === 'true') return;
  const distTypes = path.join(rootDir, 'dist', 'src', 'index.d.ts');
  if (!fs.existsSync(distTypes)) {
    console.log('\n🔨 Building core (dist)...');
    execSync('npm run core:build:dist', { cwd: rootDir, stdio: 'inherit' });
  }
  execSync('npm run core:link-dist', { cwd: rootDir, stdio: 'inherit' });
};

console.log(`\n📦 Found ${selectedPackages.length} package(s) to build:\n`);
selectedPackages.forEach((pkg) => console.log(`   - ${pkg}`));
console.log();

const failed = [];

ensureCoreDist();

for (const pkg of selectedPackages) {
  const pkgPath = path.join(packagesDir, pkg);
  const pkgJsonPath = path.join(pkgPath, 'package.json');
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  const deps = {
    ...pkgJson.dependencies,
    ...pkgJson.devDependencies,
    ...pkgJson.optionalDependencies,
  };
  const hasDeps = Object.keys(deps).length > 0;
  const skipInstall =
    process.env.SKIP_PACKAGE_INSTALL === 'true' || process.env.CI_PACKAGE_INSTALL === 'false';

  console.log(`\n🔨 Building ${pkgJson.name}...`);

  try {
    if (hasDeps && !skipInstall) {
      execSync('npm install --ignore-scripts --no-package-lock', {
        cwd: pkgPath,
        stdio: 'inherit',
      });
    }
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
  console.log(`✅ All ${selectedPackages.length} package(s) built successfully!`);
} else {
  console.log(
    `⚠️  ${selectedPackages.length - failed.length}/${selectedPackages.length} package(s) built successfully`
  );
  console.log(`❌ Failed packages: ${failed.join(', ')}`);
  process.exit(1);
}
