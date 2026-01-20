#!/usr/bin/env node
/**
 * Generate build manifest with metadata and file integrity hashes
 */
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '../dist');
const packagePath = path.join(distPath, 'package.json');
const manifestPath = path.join(distPath, 'build-manifest.json');

if (!fs.existsSync(distPath)) {
  console.error('❌ dist/ not found. Run build first.');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

/**
 * Get git commit hash (short)
 */
function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim(); // NOSONAR
  } catch {
    return 'unknown';
  }
}

/**
 * Get git branch
 */
function getGitBranch() {
  try {
    return execSync('git branch --show-current', { encoding: 'utf-8' }).trim(); // NOSONAR
  } catch {
    return 'unknown';
  }
}

/**
 * Calculate SHA256 hash of file
 */
function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Recursively get all files in directory
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

/**
 * Generate file integrity map
 */
function generateFileIntegrity() {
  const files = {};
  const srcPath = path.join(distPath, 'src');

  if (!fs.existsSync(srcPath)) {
    return files;
  }

  const allFiles = getAllFiles(srcPath);

  allFiles.forEach((filePath) => {
    const relativePath = path.relative(distPath, filePath);
    const stats = fs.statSync(filePath);

    files[relativePath] = {
      size: stats.size,
      sha256: hashFile(filePath),
    };
  });

  return files;
}

const manifest = {
  name: pkg.name,
  version: pkg.version,
  buildDate: new Date().toISOString(),
  buildEnvironment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  git: {
    commit: getGitCommit(),
    branch: getGitBranch(),
  },
  package: {
    engines: pkg.engines,
    dependencies: Object.keys(pkg.dependencies || {}),
  },
  files: generateFileIntegrity(),
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`✅ Generated build manifest: ${manifestPath}`);
console.log(`   Version: ${manifest.version}`);
console.log(`   Commit: ${manifest.git.commit}`);
console.log(`   Files: ${Object.keys(manifest.files).length}`);
