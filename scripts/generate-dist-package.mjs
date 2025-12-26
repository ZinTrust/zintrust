import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPackage = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));

const distPackage = {
  name: rootPackage.name,
  version: rootPackage.version,
  description: rootPackage.description,
  homepage: rootPackage.homepage,
  private: false,
  repository: rootPackage.repository,
  bugs: rootPackage.bugs,
  type: 'module',
  main: 'src/index.js',
  types: 'src/index.d.ts',
  bin: {
    zintrust: 'bin/zintrust.js',
    zin: 'bin/zin.js',
    z: 'bin/z.js',
    zt: 'bin/zt.js',
  },
  files: ['bin', 'src'],
  engines: rootPackage.engines,
  keywords: rootPackage.keywords,
  author: rootPackage.author,
  license: rootPackage.license,
  // dependencies: rootPackage.dependencies,
  // devDependencies: rootPackage.devDependencies,
};

fs.writeFileSync(
  path.join(__dirname, '../dist/package.json'),
  JSON.stringify(distPackage, null, 2)
);

console.log('✅ dist/package.json generated');
