export type {};

const tryImport = async (specifier: string): Promise<boolean> => {
  try {
    await import(specifier);
    return true;
  } catch {
    return false;
  }
};

const importedPackagePlugin = await tryImport('@zintrust/system-debugger/plugin');

if (!importedPackagePlugin) {
  await import('../../../packages/system-debugger/src/plugin').catch(() => undefined);
}
