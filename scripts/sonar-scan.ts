#!/usr/bin/env tsx
/**
 * SonarCloud/SonarQube scan runner
 *
 * The SonarScanner CLI does NOT automatically load .env.
 * This script loads .env into process.env and then executes the local sonar-scanner binary.
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadEnv } from './utils/env';

function getScannerBinPath(): string {
  const binName = process.platform === 'win32' ? 'sonar-scanner.cmd' : 'sonar-scanner';
  return path.join(process.cwd(), 'node_modules', '.bin', binName);
}

function getSafePath(): string {
  // Sonar (S4036): PATH must only contain fixed, unwritable directories.
  const nodeBinDir = path.dirname(process.execPath);
  return process.platform === 'win32'
    ? [
        String.raw`C:\Windows\System32`,
        String.raw`C:\Windows`,
        String.raw`C:\Windows\System32\Wbem`,
        String.raw`C:\Windows\System32\WindowsPowerShell\v1.0`,
        nodeBinDir,
      ].join(';')
    : ['/usr/bin', '/bin', '/usr/sbin', '/sbin', nodeBinDir].join(':');
}

function getSafeEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: getSafePath(),
  };
}

async function main(): Promise<void> {
  loadEnv();

  const binPath = getScannerBinPath();
  const args = process.argv.slice(2);

  if (!fs.existsSync(binPath)) {
    throw new Error(
      'sonar-scanner not found. Install dependencies first (npm install) so node_modules/.bin/sonar-scanner is available.'
    );
  }

  const child = spawn(binPath, args, {
    stdio: 'inherit',
    env: getSafeEnv(),
  });

  child.on('exit', (code) => process.exit(code ?? 1));
}

await main();
