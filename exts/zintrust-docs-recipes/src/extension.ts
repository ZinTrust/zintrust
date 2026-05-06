import * as vscode from 'vscode';

const EXTENSION_NAME = 'ZinTrust Docs + Recipes';
const RECIPE_FILES = [
  'docs/routing.md',
  'docs/migrations.md',
  'docs/scheduling.md',
  'docs/package-trace.md',
  'docs/cloud-deployment.md',
  'docs/markdown-templates.md',
];

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('zintrustDocs.search', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const query = await vscode.window.showInputBox({
        prompt: 'Search the ZinTrust docs',
        placeHolder: 'routing, migration, trace, queue...',
        validateInput: (value) => (value.trim() ? undefined : 'A search query is required.'),
      });

      if (!query) {
        return;
      }

      const docs = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceFolder, 'docs/**/*.md')
      );
      const loweredQuery = query.toLowerCase();
      const matches = await Promise.all(
        docs.map(async (uri) => {
          const document = await vscode.workspace.openTextDocument(uri);
          const text = document.getText();
          const score =
            Number(
              vscode.workspace.asRelativePath(uri, false).toLowerCase().includes(loweredQuery)
            ) + Number(text.toLowerCase().includes(loweredQuery));
          return score > 0 ? { uri, score } : undefined;
        })
      );

      const found = matches.filter(
        (item): item is { uri: vscode.Uri; score: number } => item !== undefined
      );
      if (found.length === 0) {
        await vscode.window.showInformationMessage(
          `${EXTENSION_NAME}: no docs matched "${query}".`
        );
        return;
      }
      const orderedMatches = [...found].sort((left, right) => right.score - left.score);
      const items: Array<{ label: string; uri: vscode.Uri }> = orderedMatches.map((item) => ({
        label: vscode.workspace.asRelativePath(item.uri, false),
        uri: item.uri,
      }));

      const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a document to open',
      });

      if (!selection) {
        return;
      }

      await openDocument(selection.uri);
    }),
    vscode.commands.registerCommand('zintrustDocs.openRecipes', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const availableRecipes = await Promise.all(
        RECIPE_FILES.map(async (relativePath) => ({
          relativePath,
          exists: await fileExists(
            vscode.Uri.joinPath(workspaceFolder.uri, ...relativePath.split('/'))
          ),
        }))
      );

      const selection = await vscode.window.showQuickPick(
        availableRecipes
          .filter((item) => item.exists)
          .map((item) => ({
            label: item.relativePath.replace(/^docs\//, ''),
            uri: vscode.Uri.joinPath(workspaceFolder.uri, ...item.relativePath.split('/')),
          })),
        { placeHolder: 'Choose a recipe document to open' }
      );

      if (!selection) {
        return;
      }

      await openDocument(selection.uri);
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
