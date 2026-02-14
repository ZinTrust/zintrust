#!/usr/bin/env node
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable no-console */
/* eslint-disable no-restricted-syntax */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

const workersUiDir = path.join(packageRoot, 'src', 'ui', 'workers');
const outputFile = path.join(packageRoot, 'src', 'ui', 'router', 'EmbeddedAssets.ts');

const REQUIRED_FILES = [
  { fileName: 'index.html', exportName: 'INDEX_HTML' },
  { fileName: 'styles.css', exportName: 'STYLES_CSS' },
  { fileName: 'main.js', exportName: 'MAIN_JS' },
  { fileName: 'zintrust.svg', exportName: 'ZINTRUST_SVG' },
];

const encodeBase64 = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
};

const ensureFilesExist = () => {
  for (const { fileName } of REQUIRED_FILES) {
    const fullPath = path.join(workersUiDir, fileName);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing required UI asset: ${path.relative(packageRoot, fullPath)}`);
    }
  }
};

const generateSource = () => {
  const header = '// Auto-generated file. Do not edit manually.\n';
  const body = REQUIRED_FILES.map(({ fileName, exportName }) => {
    const base64 = encodeBase64(path.join(workersUiDir, fileName));
    return `export const ${exportName} = \`\n${base64}\n\`;`;
  }).join('\n\n');

  return `${header}${body}\n`;
};

const main = () => {
  ensureFilesExist();

  const source = generateSource();
  fs.writeFileSync(outputFile, source, 'utf8');

  console.log(`✅ Generated ${path.relative(packageRoot, outputFile)} from src/ui/workers assets`);
};

main();
