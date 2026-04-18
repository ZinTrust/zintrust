const fs = require('fs');
let code = fs.readFileSync('scripts/release/sync-package-versions.mjs', 'utf-8');

code = code.replace(/function normalizePeerRange\([\s\S]+?return `\^\$\{version\}`;[\r\n]+}/m, `function normalizePeerRange(version, packageName) {
  return '*';
}`);

code = code.replace(/function normalizeWorkspaceDependencyRange\([\s\S]+?return `\^\$\{version\}`;[\r\n]+}/m, `function normalizeWorkspaceDependencyRange(version) {
  // Sync to exactly what is published, or workspace protocols if needed.
  // The user explicitly requested we do not push "futures that don't exist".
  return version;
}`);

// Delete the targetRange logic I added earlier
code = code.replace(/let targetRange = publishedVersion;\s*if \(publishedVersion !== '\*' && !publishedVersion\.startsWith\('\^'\) && !publishedVersion\.startsWith\('~'\) && !publishedVersion\.startsWith\('>'\)\) \{\s*targetRange = `\^$\{publishedVersion\}`;\s*\}/gm, 
  `let targetRange = publishedVersion;`);

// What about the peerDependencies from root?
code = code.replace(/const dependencySections = \[\s*'dependencies',\s*'devDependencies',\s*'optionalDependencies',\s*'peerDependencies',\s*\];/g, 
  `const dependencySections = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
  ];`);

fs.writeFileSync('scripts/release/sync-package-versions.mjs', code);
