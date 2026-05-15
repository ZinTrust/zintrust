import * as vscode from 'vscode';

const EXTENSION_NAME = 'ZinTrust Adapter Installer';
const TERMINAL_NAME = 'ZinTrust Adapters';
const ADAPTERS = [
  '@zintrust/db-sqlite',
  '@zintrust/db-d1',
  '@zintrust/db-postgres',
  '@zintrust/db-mysql',
  '@zintrust/cache-redis',
  '@zintrust/queue-redis',
  '@zintrust/queue-rabbitmq',
  '@zintrust/mail-smtp',
  '@zintrust/mail-nodemailer',
  '@zintrust/mail-sendgrid',
  '@zintrust/trace',
  '@zintrust/workers',
  '@zintrust/cloudflare-d1-proxy',
  '@zintrust/cloudflare-email-proxy',
  '@zintrust/cloudflare-kv-proxy',
  '@zintrust/storage-s3',
  '@zintrust/storage-r2',
  '@zintrust/storage-gcs',
];

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('zintrustAdapters.installAdapter', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const selection = await vscode.window.showQuickPick(
        ADAPTERS.map((packageName) => ({
          label: packageName,
          description: `Install ${packageName} with npm`,
        })),
        { placeHolder: 'Select a ZinTrust adapter to install' }
      );

      if (!selection) {
        return;
      }

      runCommandInTerminal(workspaceFolder, `npm install ${shellQuote(selection.label)}`);
    }),
    vscode.commands.registerCommand('zintrustAdapters.showInstalled', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const packageUri = vscode.Uri.joinPath(workspaceFolder.uri, 'package.json');
      if (!(await fileExists(packageUri))) {
        await vscode.window.showWarningMessage(`${EXTENSION_NAME}: package.json was not found.`);
        return;
      }

      const document = await vscode.workspace.openTextDocument(packageUri);
      const packageJson = JSON.parse(document.getText()) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };

      const installed = [
        ...collectPackages(packageJson.dependencies),
        ...collectPackages(packageJson.devDependencies),
        ...collectPackages(packageJson.peerDependencies),
      ]
        .filter((value, index, array) => array.indexOf(value) === index)
        .sort((left, right) => left.localeCompare(right));

      const summaryUri = await writeWorkspaceReport(
        workspaceFolder,
        'installed-adapters.md',
        [
          '# Installed ZinTrust Adapters',
          '',
          ...(installed.length > 0
            ? installed.map((name) => `- ${name}`)
            : ['- No additional @zintrust adapters found']),
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

function collectPackages(packages: Record<string, string> | undefined): string[] {
  return Object.keys(packages ?? {}).filter(
    (packageName) => packageName.startsWith('@zintrust/') && packageName !== '@zintrust/core'
  );
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
