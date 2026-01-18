#!/usr/bin/env node
/**
 * Replace build placeholders like __BUILD_DATE__ in compiled files
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distIndexPath = path.join(__dirname, '../dist/src/index.js');

if (!fs.existsSync(distIndexPath)) {
  console.error('❌ dist/src/index.js not found');
  process.exit(1);
}

const buildDate = new Date().toISOString();
let content = fs.readFileSync(distIndexPath, 'utf-8');

// Replace placeholders
content = content.replaceAll('__BUILD_DATE__', buildDate);

fs.writeFileSync(distIndexPath, content);
console.log(`✅ Replaced build placeholders (BUILD_DATE: ${buildDate})`);
