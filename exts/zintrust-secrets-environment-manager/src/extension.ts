import * as vscode from 'vscode';

const EXTENSION_NAME = 'ZinTrust Secrets + Environment Manager';
const TERMINAL_NAME = 'ZinTrust Secrets';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('zintrustSecrets.checkEnv', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const envFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceFolder, '.env*')
      );
      const summaryLines = ['# ZinTrust Environment Summary', ''];
      let exampleKeys: string[] = [];
      const sortedEnvFiles = [...envFiles].sort((left, right) =>
        vscode.workspace
          .asRelativePath(left, false)
          .localeCompare(vscode.workspace.asRelativePath(right, false))
      );

      for (const uri of sortedEnvFiles) {
        const document = await vscode.workspace.openTextDocument(uri);
        const keys = parseEnvKeys(document.getText());

        if (vscode.workspace.asRelativePath(uri, false) === '.env.example') {
          exampleKeys = keys;
        }

        summaryLines.push(`- ${vscode.workspace.asRelativePath(uri, false)}: ${keys.length} keys`);
      }

      const envUri = vscode.Uri.joinPath(workspaceFolder.uri, '.env');
      const envExists = await fileExists(envUri);
      if (exampleKeys.length > 0 && envExists) {
        const envDocument = await vscode.workspace.openTextDocument(envUri);
        const envKeys = new Set(parseEnvKeys(envDocument.getText()));
        const missingKeys = exampleKeys.filter((key) => !envKeys.has(key));
        const missingKeyLines =
          missingKeys.length > 0 ? missingKeys.map((key) => `- ${key}`) : ['- None'];

        summaryLines.splice(summaryLines.length, 0, '', '## Missing From .env');
        for (const line of missingKeyLines) {
          summaryLines.push(line);
        }
      }

      const summaryUri = await writeWorkspaceReport(
        workspaceFolder,
        'env-summary.md',
        summaryLines.join('\n')
      );

      await openDocument(summaryUri);
    }),
    vscode.commands.registerCommand('zintrustSecrets.generateKey', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const choice = await vscode.window.showQuickPick(
        [
          { label: 'APP_KEY', command: 'npm exec -- zin key:generate' },
          { label: 'Custom Env Key', command: 'custom' },
        ],
        { placeHolder: 'Choose the key generation flow' }
      );

      if (!choice) {
        return;
      }

      if (choice.command === 'custom') {
        const keyName = await vscode.window.showInputBox({
          prompt: 'Env key name',
          placeHolder: 'JWT_SECRET',
          validateInput: (value) => (value.trim() ? undefined : 'A key name is required.'),
        });

        if (!keyName) {
          return;
        }

        runCommandInTerminal(
          workspaceFolder,
          `npm exec -- zin key:env ${shellQuote(keyName.trim())}`
        );
        return;
      }

      runCommandInTerminal(workspaceFolder, choice.command);
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

function parseEnvKeys(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => /^\s*([A-Z0-9_]+)=/i.exec(line)?.[1])
    .filter((value): value is string => value !== undefined);
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
