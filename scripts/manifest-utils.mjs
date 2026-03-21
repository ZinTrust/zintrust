import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const runGitCommand = (command) => {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
};

export const getGitMetadata = () => ({
  commit: runGitCommand('git rev-parse --short HEAD'),
  branch: runGitCommand('git branch --show-current'),
});

export const hashFile = (filePath) => {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
};

export const getAllFiles = (dirPath, arrayOfFiles = []) => {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;

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
};

export const generateFileIntegrity = (basePath, filePaths) => {
  const files = {};

  filePaths.forEach((filePath) => {
    const relativePath = path.relative(basePath, filePath);
    const stats = fs.statSync(filePath);

    files[relativePath] = {
      size: stats.size,
      sha256: hashFile(filePath),
    };
  });

  return files;
};

export const createManifest = (pkg, packageData, files) => ({
  name: pkg.name,
  version: pkg.version,
  buildDate: new Date().toISOString(),
  buildEnvironment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  git: getGitMetadata(),
  package: packageData,
  files,
});
