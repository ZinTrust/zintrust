import * as vscode from 'vscode';

const EXTENSION_NAME = 'ZinTrust Cloudflare Toolkit';
const TERMINAL_NAME = 'ZinTrust Cloudflare';
const CHECK_FILES = [
  'wrangler.jsonc',
  'wrangler.containers-proxy.jsonc',
  'wrangler.containers-proxy.dev.jsonc',
  'worker-configuration.d.ts',
  'docs/config-cloudflare.md',
];

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('zintrustCloudflare.checkWorkerMode', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const checks = await Promise.all(
        CHECK_FILES.map(async (relativePath) => ({
          relativePath,
          exists: await fileExists(workspaceFolder, relativePath),
        }))
      );

      const summaryUri = await writeWorkspaceReport(
        workspaceFolder,
        'cloudflare-worker-check.md',
        [
          '# ZinTrust Cloudflare Worker Check',
          '',
          ...checks.map((item) => `- ${item.exists ? 'OK' : 'Missing'}: ${item.relativePath}`),
          '',
          '## Suggested Commands',
          '- npm exec -- zin s --wg',
          '- npm exec -- zin doctor:architecture',
        ].join('\n')
      );

      await openDocument(summaryUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zintrustCloudflare.startWorker', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      runCommandInTerminal(workspaceFolder, 'npm exec -- zin s --wg');
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

async function fileExists(
  workspaceFolder: vscode.WorkspaceFolder,
  relativePath: string
): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(
      vscode.Uri.joinPath(workspaceFolder.uri, ...relativePath.split('/'))
    );
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

function runCommandInTerminal(workspaceFolder: vscode.WorkspaceFolder, command: string): void {
  const terminal =
    vscode.window.terminals.find((existingTerminal) => existingTerminal.name === TERMINAL_NAME) ??
    vscode.window.createTerminal({
      name: TERMINAL_NAME,
      cwd: workspaceFolder.uri.fsPath,
    });

  terminal.show(true);
  terminal.sendText(command, true);
}
