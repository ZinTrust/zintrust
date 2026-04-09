export type {};

const tryImport = async (specifier: string): Promise<boolean> => {
  try {
    await import(specifier);
    return true;
  } catch {
    return false;
  }
};

const importedPackagePlugin = await tryImport('@zintrust/trace/plugin');

if (!importedPackagePlugin) {
  await import('../../../packages/trace/src/plugin').catch(() => undefined);
}
