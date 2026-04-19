const fs = require('fs');
const path = require('path');

const packagesDir = path.join(__dirname, 'packages');
const dirs = fs.readdirSync(packagesDir);

for (const dir of dirs) {
  const pkgPath = path.join(packagesDir, dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    let changed = false;
    if (pkg.peerDependencies) {
      for (const key of Object.keys(pkg.peerDependencies)) {
        if (key.startsWith('@zintrust/')) {
          pkg.peerDependencies[key] = '*';
          changed = true;
        }
      }
    }
    if (changed) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    }
  }
}
