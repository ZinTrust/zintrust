import * as vscode from 'vscode';

const EXTENSION_NAME = 'ZinTrust Trace + Runtime Debugger';
const TERMINAL_NAME = 'ZinTrust Trace';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('zintrustTrace.openViewer', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      runCommandInTerminal(workspaceFolder, 'npm exec -- zin trace:status');
    }),
    vscode.commands.registerCommand('zintrustTrace.checkRuntime', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      runCommandInTerminal(workspaceFolder, 'npm exec -- zin doctor:architecture');
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
