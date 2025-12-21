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

function stripWrappingQuotes(value: string): string {
  if (value.length < 2) return value;

  const firstChar = value[0];
  const lastChar = value[value.length - 1];

  const isDoubleQuoted = firstChar === '"' && lastChar === '"';
  const isSingleQuoted = firstChar === "'" && lastChar === "'";

  if (isDoubleQuoted || isSingleQuoted) {
    return value.slice(1, -1);
  }

  return value;
}

function loadDotEnv(): void {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;

    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const rawLine of envContent.split('\n')) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith('#')) continue;

      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) continue;

      const key = line.slice(0, eqIndex).trim();
      const valueRaw = line.slice(eqIndex + 1).trim();

      if (key.length === 0) continue;
      if (process.env[key] !== undefined) continue; // don't override existing env

      const value = stripWrappingQuotes(valueRaw);
      process.env[key] = value;
    }
  } catch {
    // Ignore .env loading errors
  }
}

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
  loadDotEnv();

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
