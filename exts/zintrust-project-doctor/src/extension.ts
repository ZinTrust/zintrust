import * as vscode from 'vscode';

const EXTENSION_NAME = 'ZinTrust Project Doctor';
const TERMINAL_NAME = 'ZinTrust Doctor';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('zintrustDoctor.runChecks', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const action = await vscode.window.showQuickPick(
        [
          { label: 'Architecture Doctor', command: 'npm exec -- zin doctor:architecture' },
          { label: 'Lint', command: 'npm run lint' },
          { label: 'Type Check', command: 'npm run type-check' },
          { label: 'Test', command: 'npm test' },
          { label: 'Full QA', command: 'npm exec -- zin qa' },
        ],
        { placeHolder: 'Choose the diagnostic command to run' }
      );

      if (!action) {
        return;
      }

      runCommandInTerminal(workspaceFolder, action.command);
    }),
    vscode.commands.registerCommand('zintrustDoctor.explainFailure', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const action = await vscode.window.showQuickPick(
        [
          { label: 'Architecture Issues', relativePath: 'docs/architecture.md' },
          { label: 'Migration Failures', relativePath: 'docs/migrations.md' },
          { label: 'Routing Problems', relativePath: 'docs/routing.md' },
          { label: 'Cloudflare Setup', relativePath: 'docs/config-cloudflare.md' },
          { label: 'Workers and Queues', relativePath: 'docs/worker-management.md' },
          { label: 'Template Generation', relativePath: 'docs/markdown-templates.md' },
        ],
        { placeHolder: 'Choose the failure area to investigate' }
      );

      if (!action) {
        return;
      }

      const documentUri = vscode.Uri.joinPath(
        workspaceFolder.uri,
        ...action.relativePath.split('/')
      );
      await openDocument(documentUri);
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
