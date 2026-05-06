import * as vscode from 'vscode';

const EXTENSION_NAME = 'ZinTrust Workers + Queue Console';
const TERMINAL_NAME = 'ZinTrust Workers';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('zintrustWorkers.showStatus', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      runCommandInTerminal(workspaceFolder, 'npm exec -- zin worker:summary');
    }),
    vscode.commands.registerCommand('zintrustWorkers.runSchedule', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const scheduleFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceFolder, 'app/Schedules/**/*.ts')
      );

      const firstSuggestion = scheduleFiles
        .map((uri) =>
          vscode.workspace.asRelativePath(uri, false).split('/').pop()?.replace(/\.ts$/, '')
        )
        .find(
          (value): value is string => value !== undefined && value.length > 0 && value !== 'index'
        );

      const scheduleName = await vscode.window.showInputBox({
        prompt: 'Schedule name to run once',
        placeHolder: firstSuggestion ?? 'jobTracking.cleanup',
        value: firstSuggestion ?? '',
        validateInput: (value) => (value.trim() ? undefined : 'A schedule name is required.'),
      });

      if (!scheduleName) {
        return;
      }

      runCommandInTerminal(
        workspaceFolder,
        `npm exec -- zin schedule:run --name ${shellQuote(scheduleName.trim())}`
      );
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

function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}
