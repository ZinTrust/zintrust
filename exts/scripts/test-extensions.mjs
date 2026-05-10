import assert from 'node:assert/strict';
import { createHarness } from './lib/extension-harness.mjs';

const harness = createHarness();

try {
  for (const extensionDir of harness.extensionDirs) {
    const manifest = harness.readManifest(extensionDir);
    console.log(`== ${extensionDir} ==`);

    if (!manifest.main) {
      assert.ok(
        Array.isArray(manifest.extensionPack),
        `${extensionDir} should declare an extensionPack array.`
      );
      assert.ok(
        manifest.extensionPack.length > 0,
        `${extensionDir} should include packaged extensions.`
      );
      continue;
    }

    const loaded = harness.loadExtension(extensionDir);
    const extensionModule = loaded.extensionModule;
    assert.equal(
      typeof extensionModule.activate,
      'function',
      `${extensionDir} should export activate().`
    );

    const commandIds = manifest.contributes.commands.map((item) => item.command);
    for (const commandId of commandIds) {
      assert.ok(
        harness.registeredCommands.has(commandId),
        `${extensionDir} did not register ${commandId}.`
      );
    }

    for (const commandId of commandIds) {
      harness.resetSideEffects();
      await harness.registeredCommands.get(commandId)();

      assert.ok(
        harness.sideEffects.openedDocuments.length > 0 ||
          harness.sideEffects.terminalCommands.length > 0 ||
          harness.sideEffects.executedCommands.length > 0 ||
          harness.sideEffects.webviewPanels.length > 0 ||
          harness.sideEffects.writtenFiles.length > 0,
        `${extensionDir} command ${commandId} did not produce a meaningful side effect.`
      );
    }
  }

  console.log('All ZinTrust extension command surfaces passed.');
} finally {
  harness.restore();
}
