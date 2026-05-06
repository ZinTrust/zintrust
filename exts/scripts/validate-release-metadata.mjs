import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extensionDirs, workspaceRoot } from './lib/extension-harness.mjs';

const workflowPath = path.resolve(workspaceRoot, '..', '.github', 'workflows', 'exts-release.yml');
const workflow = readFileSync(workflowPath, 'utf8');
const workspaceManifest = JSON.parse(
  readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8')
);
const releasingGuide = readFileSync(path.join(workspaceRoot, 'RELEASING.md'), 'utf8');

assert.equal(
  workspaceManifest.scripts['release:artifacts'],
  'npm run validate && node ./scripts/collect-vsix-artifacts.mjs',
  'exts/package.json should expose a release:artifacts script.'
);
assert.match(workflow, /workflow_dispatch:/, 'Release workflow should support manual dispatch.');
assert.match(workflow, /push:\s+tags:/, 'Release workflow should package tagged releases.');
assert.match(
  workflow,
  /npm --prefix exts ci --ignore-scripts/,
  'Release workflow should install the exts workspace without lifecycle scripts.'
);
assert.match(
  workflow,
  /npm --prefix exts run release:artifacts/,
  'Release workflow should build and collect VSIX artifacts.'
);
assert.match(
  workflow,
  /actions\/upload-artifact@/,
  'Release workflow should upload packaged artifacts.'
);
assert.match(releasingGuide, /VSCE_PAT/, 'RELEASING.md should mention the VSCE_PAT secret.');
assert.match(
  releasingGuide,
  /release:artifacts/,
  'RELEASING.md should document the release script.'
);

for (const extensionDir of extensionDirs) {
  const manifestPath = path.join(workspaceRoot, extensionDir, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  assert.equal(
    manifest.publisher,
    'zintrust',
    `${extensionDir} should use the zintrust publisher.`
  );
  assert.equal(manifest.license, 'MIT', `${extensionDir} should declare an MIT license.`);
  assert.equal(
    manifest.repository?.url,
    'https://github.com/ZinTrust/zintrust.git',
    `${extensionDir} should point back to the ZinTrust repository.`
  );
  assert.equal(
    manifest.repository?.directory,
    `exts/${extensionDir}`,
    `${extensionDir} should declare its repository directory.`
  );
  assert.equal(
    manifest.homepage,
    `https://github.com/ZinTrust/zintrust/tree/master/exts/${extensionDir}`,
    `${extensionDir} should declare a GitHub homepage.`
  );
  assert.equal(
    manifest.bugs?.url,
    'https://github.com/ZinTrust/zintrust/issues',
    `${extensionDir} should route bug reports to the repo issues page.`
  );
  assert.ok(manifest.files.includes('package.json'), `${extensionDir} should ship package.json.`);
  assert.ok(manifest.files.includes('README.md'), `${extensionDir} should ship README.md.`);
  assert.ok(manifest.files.includes('LICENSE.md'), `${extensionDir} should ship LICENSE.md.`);

  if (manifest.main) {
    assert.ok(manifest.files.includes('out/**'), `${extensionDir} should ship compiled output.`);
    continue;
  }

  assert.ok(
    Array.isArray(manifest.extensionPack) && manifest.extensionPack.length > 0,
    `${extensionDir} should declare the extension pack contents.`
  );
}

console.log('Release metadata and workflow checks passed.');
