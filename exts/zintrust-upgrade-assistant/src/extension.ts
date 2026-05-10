import * as vscode from 'vscode';

const EXTENSION_NAME = 'ZinTrust Upgrade Assistant';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('zintrustUpgrade.checkProject', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const packageUri = vscode.Uri.joinPath(workspaceFolder.uri, 'package.json');
      const document = await vscode.workspace.openTextDocument(packageUri);
      const packageJson = JSON.parse(document.getText()) as {
        name?: string;
        version?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      const installedCoreVersion =
        packageJson.name === '@zintrust/core'
          ? packageJson.version
          : (packageJson.dependencies?.['@zintrust/core'] ??
            packageJson.devDependencies?.['@zintrust/core'] ??
            'not installed');

      const summaryUri = await writeWorkspaceReport(
        workspaceFolder,
        'upgrade-summary.md',
        [
          '# ZinTrust Upgrade Summary',
          '',
          `- Package: ${packageJson.name ?? 'unknown'}`,
          `- Version: ${packageJson.version ?? 'unknown'}`,
          `- @zintrust/core: ${installedCoreVersion}`,
          `- Changelog: ${(await fileExists(vscode.Uri.joinPath(workspaceFolder.uri, 'docs', 'change-log.md'))) ? 'docs/change-log.md' : 'missing'}`,
          '',
          'Open the preview command to inspect the changelog before upgrading.',
        ].join('\n')
      );

      await openDocument(summaryUri);
    }),
    vscode.commands.registerCommand('zintrustUpgrade.previewUpgrade', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const primary = vscode.Uri.joinPath(workspaceFolder.uri, 'docs', 'change-log.md');
      if (await fileExists(primary)) {
        await openDocument(primary);
        return;
      }

      const fallback = vscode.Uri.joinPath(workspaceFolder.uri, 'CHANGELOG.md');
      await openDocument(fallback);
    })
  );
}

function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const activeFolder = vscode.window.activeTextEditor
    ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
    : undefined;
  const workspaceFolder = activeFolder ?? vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    void vscode.window.showErrorMessage(`${EXTENSION_NAME}: open a ZinTrust workspace first.`);
    return undefined;
  }

  return workspaceFolder;
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function writeWorkspaceReport(
  workspaceFolder: vscode.WorkspaceFolder,
  fileName: string,
  content: string
): Promise<vscode.Uri> {
  const reportDir = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'zintrust');
  await vscode.workspace.fs.createDirectory(reportDir);

  const reportUri = vscode.Uri.joinPath(reportDir, fileName);
  await vscode.workspace.fs.writeFile(reportUri, new TextEncoder().encode(content));
  return reportUri;
}

async function openDocument(uri: vscode.Uri): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document, { preview: false });
}
