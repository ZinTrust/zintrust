import * as vscode from 'vscode';

const EXTENSION_NAME = 'ZinTrust Notifications + Templates Studio';
const TERMINAL_NAME = 'ZinTrust Templates';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('zintrustTemplates.createTemplate', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const templateType = await vscode.window.showQuickPick(
        [
          { label: 'Mail Template', command: 'npm exec -- zin make:mail-template' },
          { label: 'Notification Template', command: 'npm exec -- zin make:notification-template' },
        ],
        { placeHolder: 'Choose the template type to scaffold' }
      );

      if (!templateType) {
        return;
      }

      const templateName = await vscode.window.showInputBox({
        prompt: 'Template name',
        placeHolder: 'welcome',
        validateInput: (value) => (value.trim() ? undefined : 'A template name is required.'),
      });

      if (!templateName) {
        return;
      }

      runCommandInTerminal(
        workspaceFolder,
        `${templateType.command} ${shellQuote(templateName.trim())}`
      );
    }),
    vscode.commands.registerCommand('zintrustTemplates.previewTemplate', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const templateFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceFolder, '{src/**/*.md,app/**/*.md,docs/**/*.md}')
      );

      const candidates = templateFiles.filter((uri) =>
        /mail|notification|markdown/i.test(vscode.workspace.asRelativePath(uri, false))
      );

      if (candidates.length === 0) {
        const fallback = vscode.Uri.joinPath(workspaceFolder.uri, 'docs', 'markdown-templates.md');
        if (await fileExists(fallback)) {
          await openDocument(fallback);
          await vscode.commands.executeCommand('markdown.showPreview', fallback);
          return;
        }

        await vscode.window.showWarningMessage(
          `${EXTENSION_NAME}: no markdown templates were found.`
        );
        return;
      }

      const selection = await vscode.window.showQuickPick(
        candidates.map((uri) => ({ label: vscode.workspace.asRelativePath(uri, false), uri })),
        { placeHolder: 'Choose a template or markdown file to preview' }
      );

      if (!selection) {
        return;
      }

      await openDocument(selection.uri);
      await vscode.commands.executeCommand('markdown.showPreview', selection.uri);
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
