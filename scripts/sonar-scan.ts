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

      const value = valueRaw.replaceAll(/(^["']|["']$)/g, '');
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

async function main(): Promise<void> {
  loadDotEnv();

  const binPath = getScannerBinPath();
  const args = process.argv.slice(2);

  if (!fs.existsSync(binPath)) {
    // Fall back to npx if local binary isn't available for some reason
    const child = spawn('npx', ['sonar-scanner', ...args], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('exit', (code) => process.exit(code ?? 1));
    return;
  }

  const child = spawn(binPath, args, {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code) => process.exit(code ?? 1));
}

await main();
