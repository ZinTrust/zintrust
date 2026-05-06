import assert from 'node:assert/strict';
import path from 'node:path';
import { createHarness, repoRoot } from './lib/extension-harness.mjs';

const harness = createHarness();

const behaviorChecks = {
  'zintrust-adapter-installer': async () => {
    harness.loadExtension('zintrust-adapter-installer');
    harness.resetSideEffects();
    await harness.registeredCommands.get('zintrustAdapters.showInstalled')();
    assertWrittenFile('installed-adapters.md');
  },
  'zintrust-cloudflare-toolkit': async () => {
    harness.loadExtension('zintrust-cloudflare-toolkit');
    harness.resetSideEffects();
    await harness.registeredCommands.get('zintrustCloudflare.checkWorkerMode')();
    assertWrittenFile('cloudflare-worker-check.md');
  },
  'zintrust-core': async () => {
    harness.loadExtension('zintrust-core');
    assert.ok(
      harness.sideEffects.treeViews.some((view) => view.viewId === 'zintrustExplorer'),
      'zintrust-core should create the explorer view.'
    );
    assert.ok(
      harness.sideEffects.statusBarItems.some(
        (item) => item.command === 'zintrustCore.openDashboard' && item.shown
      ),
      'zintrust-core should show a dashboard status bar item.'
    );

    harness.resetSideEffects();
    await harness.registeredCommands.get('zintrustCore.openDashboard')();
    assert.equal(harness.sideEffects.webviewPanels.length, 1, 'Dashboard should open a webview.');
    assert.match(harness.sideEffects.webviewPanels[0].html, /ZinTrust Project Dashboard/);
    assert.match(harness.sideEffects.webviewPanels[0].html, /command:zintrustCore.runQa/);
    assert.match(harness.sideEffects.webviewPanels[0].html, /command:zintrustCore.createResource/);
  },
  'zintrust-developer-pack': async () => {
    const manifest = harness.readManifest('zintrust-developer-pack');
    assert.ok(
      Array.isArray(manifest.extensionPack),
      'Developer pack should declare extensionPack.'
    );
    assert.ok(
      manifest.extensionPack.includes('zintrust.zintrust-core'),
      'Developer pack should include zintrust-core.'
    );
  },
  'zintrust-docs-recipes': async () => {
    harness.loadExtension('zintrust-docs-recipes');
    harness.resetSideEffects();
    await harness.registeredCommands.get('zintrustDocs.search')();
    assert.ok(
      harness.sideEffects.openedDocuments.length > 0,
      'Docs search should open a document.'
    );
  },
  'zintrust-notifications-templates-studio': async () => {
    harness.loadExtension('zintrust-notifications-templates-studio');
    harness.resetSideEffects();
    await harness.registeredCommands.get('zintrustTemplates.previewTemplate')();
    assert.ok(
      harness.sideEffects.executedCommands.some(
        (entry) => entry.command === 'markdown.showPreview'
      ),
      'Template preview should trigger markdown preview.'
    );
  },
  'zintrust-orm-migrations-studio': async () => {
    harness.loadExtension('zintrust-orm-migrations-studio');
    harness.resetSideEffects();
    await harness.registeredCommands.get('zintrustData.inspectSchema')();
    assertWrittenFile('schema-summary.md');
  },
  'zintrust-project-doctor': async () => {
    harness.loadExtension('zintrust-project-doctor');
    harness.resetSideEffects();
    await harness.registeredCommands.get('zintrustDoctor.runChecks')();
    assertTerminalCommand(/npm exec -- zin /);
  },
  'zintrust-routes-explorer': async () => {
    harness.loadExtension('zintrust-routes-explorer');
    harness.resetSideEffects();
    await harness.registeredCommands.get('zintrustRoutes.exportSummary')();
    assertWrittenFile('routes-summary.md');
  },
  'zintrust-secrets-environment-manager': async () => {
    harness.loadExtension('zintrust-secrets-environment-manager');
    harness.resetSideEffects();
    await harness.registeredCommands.get('zintrustSecrets.checkEnv')();
    assertWrittenFile('env-summary.md');
  },
  'zintrust-trace-runtime-debugger': async () => {
    harness.loadExtension('zintrust-trace-runtime-debugger');
    harness.resetSideEffects();
    await harness.registeredCommands.get('zintrustTrace.openViewer')();
    assertTerminalCommand(/trace:status/);
  },
  'zintrust-upgrade-assistant': async () => {
    harness.loadExtension('zintrust-upgrade-assistant');
    harness.resetSideEffects();
    await harness.registeredCommands.get('zintrustUpgrade.checkProject')();
    assertWrittenFile('upgrade-summary.md');
  },
  'zintrust-workers-queue-console': async () => {
    harness.loadExtension('zintrust-workers-queue-console');
    harness.resetSideEffects();
    await harness.registeredCommands.get('zintrustWorkers.runSchedule')();
    assertTerminalCommand(/schedule:run --name/);
  },
};

try {
  for (const extensionDir of Object.keys(behaviorChecks).sort((left, right) =>
    left.localeCompare(right)
  )) {
    console.log(`== ${extensionDir} ==`);
    await behaviorChecks[extensionDir]();
  }

  console.log('Focused extension behavior checks passed.');
} finally {
  harness.restore();
}

function assertTerminalCommand(pattern) {
  assert.ok(
    harness.sideEffects.terminalCommands.some((command) => pattern.test(command)),
    `Expected a terminal command matching ${String(pattern)}.`
  );
}

function assertWrittenFile(fileName) {
  const expectedPath = path.join(repoRoot, '.vscode', 'zintrust', fileName);
  assert.ok(
    harness.sideEffects.writtenFiles.includes(expectedPath),
    `Expected ${fileName} to be written to the workspace report folder.`
  );
}
