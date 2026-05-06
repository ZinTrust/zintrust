import * as vscode from 'vscode';

const EXTENSION_NAME = 'ZinTrust ORM + Migrations Studio';
const TERMINAL_NAME = 'ZinTrust Data';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('zintrustData.createMigration', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const modelName = await vscode.window.showInputBox({
        prompt: 'Model name for the migration shortcut',
        placeHolder: 'user',
        validateInput: (value) => (value.trim() ? undefined : 'A model name is required.'),
      });

      if (!modelName) {
        return;
      }

      runCommandInTerminal(
        workspaceFolder,
        `npm exec -- zin cm ${shellQuote(modelName.trim())} --no-interactive`
      );
    }),
    vscode.commands.registerCommand('zintrustData.inspectSchema', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const migrations = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceFolder, 'database/migrations/**/*.ts')
      );
      const sortedMigrations = [...migrations].sort((left, right) =>
        vscode.workspace
          .asRelativePath(left, false)
          .localeCompare(vscode.workspace.asRelativePath(right, false))
      );

      const summaryUri = await writeWorkspaceReport(
        workspaceFolder,
        'schema-summary.md',
        [
          '# ZinTrust Schema Summary',
          '',
          `Migration count: ${migrations.length}`,
          '',
          '## Migrations',
          ...sortedMigrations.map((uri) => `- ${vscode.workspace.asRelativePath(uri, false)}`),
          '',
          '## Key Files',
          '- config/database.ts',
          '- docs/migrations.md',
        ].join('\n')
      );

      await openDocument(summaryUri);
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

function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}
