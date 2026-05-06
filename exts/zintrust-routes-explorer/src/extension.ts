import * as vscode from 'vscode';

const EXTENSION_NAME = 'ZinTrust Routes Explorer';
const ROUTE_PATTERNS = ['routes/**/*.ts', 'src/routes/**/*.ts', 'packages/**/routes/**/*.ts'];

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('zintrustRoutes.refresh', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const routes = await collectRouteFiles(workspaceFolder);
      if (routes.length === 0) {
        await vscode.window.showWarningMessage(`${EXTENSION_NAME}: no route files were found.`);
        return;
      }

      const selection = await vscode.window.showQuickPick(
        routes.map((uri) => ({
          label: vscode.workspace.asRelativePath(uri, false),
          uri,
        })),
        { placeHolder: 'Select a route file to open' }
      );

      if (!selection) {
        return;
      }

      await openDocument(selection.uri);
    }),
    vscode.commands.registerCommand('zintrustRoutes.exportSummary', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const routes = await collectRouteFiles(workspaceFolder);
      const sections = await Promise.all(
        routes.map(async (uri) => {
          const document = await vscode.workspace.openTextDocument(uri);
          const routeLines = document
            .getText()
            .split(/\r?\n/)
            .filter((line) =>
              /(Router|router)\.(get|post|put|patch|del|delete|any)|createRouter|group\(|resource\(/.test(
                line
              )
            )
            .slice(0, 6)
            .map((line) => `  - ${line.trim()}`);

          return [`- ${vscode.workspace.asRelativePath(uri, false)}`, ...routeLines].join('\n');
        })
      );

      const summaryUri = await writeWorkspaceReport(
        workspaceFolder,
        'routes-summary.md',
        [
          '# ZinTrust Routes Summary',
          '',
          `Route files found: ${routes.length}`,
          '',
          ...sections,
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

async function collectRouteFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<vscode.Uri[]> {
  const routeMap = new Map<string, vscode.Uri>();

  for (const pattern of ROUTE_PATTERNS) {
    const matches = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, pattern)
    );
    for (const uri of matches) {
      routeMap.set(uri.toString(), uri);
    }
  }

  return [...routeMap.values()].sort((left, right) =>
    vscode.workspace
      .asRelativePath(left, false)
      .localeCompare(vscode.workspace.asRelativePath(right, false))
  );
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
