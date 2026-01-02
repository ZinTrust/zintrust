import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const packagesDir = path.join(repoRoot, 'packages');

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  const raw = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(filePath, raw, 'utf8');
}

function normalizePeerRange(version) {
  // Keep peers compatible with the current core major/minor.
  // If you prefer strict lockstep, change to just `${version}`.
  return `^${version}`;
}

async function main() {
  const rootPkgPath = path.join(repoRoot, 'package.json');
  const rootPkg = await readJson(rootPkgPath);

  const coreName = rootPkg.name;
  const coreVersion = rootPkg.version;

  if (typeof coreName !== 'string' || coreName.length === 0) {
    throw new Error('Root package.json is missing a valid "name"');
  }
  if (typeof coreVersion !== 'string' || coreVersion.length === 0) {
    throw new Error('Root package.json is missing a valid "version"');
  }

  const entries = await fs.readdir(packagesDir, { withFileTypes: true });
  const packageDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  const touched = [];

  for (const dirName of packageDirs) {
    const pkgPath = path.join(packagesDir, dirName, 'package.json');

    try {
      const pkg = await readJson(pkgPath);

      pkg.version = coreVersion;

      pkg.peerDependencies = pkg.peerDependencies ?? {};
      if (typeof pkg.peerDependencies !== 'object' || pkg.peerDependencies === null) {
        pkg.peerDependencies = {};
      }

      // Keep adapter packages tracking the core version.
      pkg.peerDependencies[coreName] = normalizePeerRange(coreVersion);

      await writeJson(pkgPath, pkg);
      touched.push(path.relative(repoRoot, pkgPath));
    } catch (error) {
      // Ignore folders without package.json.
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }
  }

  process.stdout.write(
    `Synced ${touched.length} package(s) to ${coreName}@${coreVersion}\n` +
      touched.map((p) => `- ${p}`).join('\n') +
      (touched.length ? '\n' : '')
  );
}

await main();
