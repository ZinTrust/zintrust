import * as vscode from 'vscode';

const EXTENSION_NAME = 'ZinTrust Core';
const TERMINAL_NAME = 'ZinTrust';
const TREE_VIEW_ID = 'zintrustExplorer';

type ResourceType = {
  label: string;
  description: string;
  createCommand: (name: string) => string;
};

type DashboardAction = {
  readonly label: string;
  readonly description: string;
  readonly command: string;
  readonly icon: string;
  readonly relativePaths?: readonly string[];
};

type DashboardGroup = {
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly items: readonly DashboardAction[];
};

type ExplorerNode =
  | {
      readonly kind: 'group';
      readonly group: DashboardGroup;
    }
  | {
      readonly kind: 'action';
      readonly action: DashboardAction;
    };

let dashboardPanel: vscode.WebviewPanel | undefined;

const projectActions = Object.freeze<readonly DashboardAction[]>([
  {
    label: 'Open README',
    description: 'Open the project README for orientation',
    command: 'zintrustCore.openReadme',
    icon: 'book',
    relativePaths: ['README.md', 'docs/getting-started.md'],
  },
  {
    label: 'Open Routes',
    description: 'Jump into the main routes file',
    command: 'zintrustCore.openRoutes',
    icon: 'symbol-method',
    relativePaths: ['routes/api.ts', 'src/routes/CoreRoutes.ts'],
  },
  {
    label: 'Open Database Config',
    description: 'Review active database configuration',
    command: 'zintrustCore.openDatabaseConfig',
    icon: 'database',
    relativePaths: ['config/database.ts'],
  },
  {
    label: 'Open CLI Reference',
    description: 'Browse framework command documentation',
    command: 'zintrustCore.openCliReference',
    icon: 'terminal',
    relativePaths: ['docs/cli-reference.md', 'docs/cli-guide.md'],
  },
]);

const workflowActions = Object.freeze<readonly DashboardAction[]>([
  {
    label: 'Run QA',
    description: 'Launch lint, tests, type-check, or the full ZinTrust QA flow',
    command: 'zintrustCore.runQa',
    icon: 'beaker',
  },
  {
    label: 'Create Resource',
    description: 'Scaffold framework resources without leaving VS Code',
    command: 'zintrustCore.createResource',
    icon: 'tools',
  },
]);

const dashboardGroups = Object.freeze<readonly DashboardGroup[]>([
  {
    label: 'Project Files',
    description: 'Open the files you reach for first in a ZinTrust project.',
    icon: 'folder-library',
    items: projectActions,
  },
  {
    label: 'Workflows',
    description: 'Run the framework workflows that usually require a terminal hop.',
    icon: 'rocket',
    items: workflowActions,
  },
]);

const resourceTypes: readonly ResourceType[] = [
  {
    label: 'Controller',
    description: 'Create a controller with zin create controller <name>',
    createCommand: (name) => `npm exec -- zin create controller ${shellQuote(name)}`,
  },
  {
    label: 'Model',
    description: 'Create a model with zin create model <name>',
    createCommand: (name) => `npm exec -- zin create model ${shellQuote(name)}`,
  },
  {
    label: 'Middleware',
    description: 'Create middleware with zin create middleware <name>',
    createCommand: (name) => `npm exec -- zin create middleware ${shellQuote(name)}`,
  },
  {
    label: 'Job',
    description: 'Create a queued job with zin create job <name>',
    createCommand: (name) => `npm exec -- zin create job ${shellQuote(name)}`,
  },
  {
    label: 'Schedule',
    description: 'Create a schedule with zin create schedule <name>',
    createCommand: (name) => `npm exec -- zin create schedule ${shellQuote(name)}`,
  },
  {
    label: 'Migration',
    description: 'Create a migration with zin cm <model> --no-interactive',
    createCommand: (name) => `npm exec -- zin cm ${shellQuote(name)} --no-interactive`,
  },
  {
    label: 'Mail Template',
    description: 'Scaffold a markdown mail template',
    createCommand: (name) => `npm exec -- zin make:mail-template ${shellQuote(name)}`,
  },
  {
    label: 'Notification Template',
    description: 'Scaffold a markdown notification template',
    createCommand: (name) => `npm exec -- zin make:notification-template ${shellQuote(name)}`,
  },
];

export function activate(context: vscode.ExtensionContext): void {
  const treeView = vscode.window.createTreeView(TREE_VIEW_ID, {
    treeDataProvider: createExplorerTreeProvider(),
    showCollapseAll: false,
  });
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = '$(tools) ZinTrust';
  statusBarItem.tooltip = 'Open the ZinTrust project dashboard';
  statusBarItem.command = 'zintrustCore.openDashboard';
  statusBarItem.show();

  const fileActions = dashboardGroups
    .flatMap((group) => group.items)
    .filter(
      (action): action is DashboardAction & { relativePaths: readonly string[] } =>
        Array.isArray(action.relativePaths) && action.relativePaths.length > 0
    )
    .map((action) =>
      vscode.commands.registerCommand(action.command, async () => {
        const workspaceFolder = getWorkspaceFolder();
        if (!workspaceFolder) {
          return;
        }

        await openFirstExistingFile(workspaceFolder, action.relativePaths);
      })
    );

  context.subscriptions.push(
    treeView,
    statusBarItem,
    ...fileActions,
    vscode.commands.registerCommand('zintrustCore.openDashboard', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      openDashboardPanel(workspaceFolder);
    }),
    vscode.commands.registerCommand('zintrustCore.runQa', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      await runQa(workspaceFolder);
    }),
    vscode.commands.registerCommand('zintrustCore.createResource', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      await createResource(workspaceFolder);
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

async function runQa(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
  const action = await vscode.window.showQuickPick(
    [
      { label: 'Framework QA', command: 'npm exec -- zin qa' },
      { label: 'Lint', command: 'npm run lint' },
      { label: 'Type Check', command: 'npm run type-check' },
      { label: 'Test', command: 'npm test' },
      { label: 'Coverage Patch', command: 'npm run coverage:patch' },
    ],
    {
      placeHolder: 'Select the QA command to run',
    }
  );

  if (!action) {
    return;
  }

  runCommandInTerminal(workspaceFolder, action.command);
}

async function createResource(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
  const resource = await vscode.window.showQuickPick(resourceTypes, {
    placeHolder: 'Select the ZinTrust resource to create',
  });

  if (!resource) {
    return;
  }

  const name = await vscode.window.showInputBox({
    prompt: `${resource.label} name`,
    placeHolder: resource.label === 'Migration' ? 'user' : 'ExampleName',
    validateInput: (value) => (value.trim() ? undefined : 'A name is required.'),
  });

  if (!name) {
    return;
  }

  runCommandInTerminal(workspaceFolder, resource.createCommand(name.trim()));
}

async function openFirstExistingFile(
  workspaceFolder: vscode.WorkspaceFolder,
  relativePaths: readonly string[]
): Promise<void> {
  const candidates = relativePaths.map((relativePath) => ({
    relativePath,
    fileUri: vscode.Uri.joinPath(workspaceFolder.uri, ...relativePath.split('/')),
  }));
  const existingUris = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        await vscode.workspace.fs.stat(candidate.fileUri);
        return candidate.fileUri;
      } catch {
        return undefined;
      }
    })
  );
  const firstExistingUri = existingUris.find((uri) => uri !== undefined);

  if (firstExistingUri) {
    const document = await vscode.workspace.openTextDocument(firstExistingUri);
    await vscode.window.showTextDocument(document, { preview: false });
    return;
  }

  await vscode.window.showWarningMessage(
    `${EXTENSION_NAME}: none of these files were found: ${relativePaths.join(', ')}`
  );
}

function createExplorerTreeProvider(): vscode.TreeDataProvider<ExplorerNode> {
  return {
    getTreeItem(node: ExplorerNode): vscode.TreeItem {
      if (node.kind === 'group') {
        const treeItem = new vscode.TreeItem(
          node.group.label,
          vscode.TreeItemCollapsibleState.Expanded
        );
        treeItem.description = node.group.description;
        treeItem.iconPath = new vscode.ThemeIcon(node.group.icon);
        return treeItem;
      }

      const treeItem = new vscode.TreeItem(node.action.label, vscode.TreeItemCollapsibleState.None);
      treeItem.description = node.action.description;
      treeItem.tooltip = node.action.description;
      treeItem.iconPath = new vscode.ThemeIcon(node.action.icon);
      treeItem.command = {
        command: node.action.command,
        title: node.action.label,
      };
      return treeItem;
    },
    getChildren(node?: ExplorerNode): ExplorerNode[] {
      if (!node) {
        return dashboardGroups.map((group) => ({ kind: 'group', group }));
      }

      if (node.kind === 'action') {
        return [];
      }

      return node.group.items.map((action) => ({ kind: 'action', action }));
    },
  };
}

function openDashboardPanel(workspaceFolder: vscode.WorkspaceFolder): void {
  const panelTitle = `${EXTENSION_NAME}: ${workspaceFolder.name}`;

  if (dashboardPanel) {
    dashboardPanel.title = panelTitle;
    dashboardPanel.webview.html = renderDashboardHtml(workspaceFolder.name);
    dashboardPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  dashboardPanel = vscode.window.createWebviewPanel(
    'zintrustDashboard',
    panelTitle,
    vscode.ViewColumn.One,
    {
      enableCommandUris: true,
      retainContextWhenHidden: true,
    }
  );
  dashboardPanel.webview.html = renderDashboardHtml(workspaceFolder.name);
  dashboardPanel.onDidDispose(() => {
    dashboardPanel = undefined;
  });
}

function renderDashboardHtml(workspaceName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ZinTrust Project Dashboard</title>
    <style>${dashboardStyles()}</style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="eyebrow">ZinTrust Workspace</p>
        <h1>${escapeHtml(workspaceName)}</h1>
        <p>
          Use the explorer view, command palette, or the cards below to jump straight into
          the framework files and workflows that matter most while you are building with ZinTrust.
        </p>
      </section>
      <div class="groups">${renderDashboardSections()}</div>
    </main>
  </body>
</html>`;
}

function renderDashboardSections(): string {
  return dashboardGroups.map((group) => renderDashboardSection(group)).join('');
}

function renderDashboardSection(group: DashboardGroup): string {
  const items = group.items.map((item) => renderDashboardAction(item)).join('');

  return `
    <section class="group">
      <div class="group-header">
        <p class="eyebrow">${escapeHtml(group.label)}</p>
        <h2>${escapeHtml(group.description)}</h2>
      </div>
      <div class="action-grid">${items}</div>
    </section>
  `;
}

function renderDashboardAction(item: DashboardAction): string {
  return `
    <a class="action-card" href="${commandUri(item.command)}">
      <span class="action-icon">${escapeHtml(iconGlyph(item.icon))}</span>
      <span class="action-copy">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.description)}</span>
      </span>
    </a>
  `;
}

function dashboardStyles(): string {
  return `
    ${dashboardBaseStyles()}
    ${dashboardLayoutStyles()}
    ${dashboardCardStyles()}
    ${dashboardResponsiveStyles()}
  `;
}

function dashboardBaseStyles(): string {
  return `
    :root {
      color-scheme: light dark;
      --bg: #09131f;
      --bg-alt: rgba(17, 29, 43, 0.72);
      --border: rgba(151, 180, 204, 0.22);
      --text: #f4f8fb;
      --muted: #b5c7d8;
      --accent: #ffb454;
      --accent-soft: rgba(255, 180, 84, 0.14);
      --shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Georgia, 'Times New Roman', serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(255, 180, 84, 0.18), transparent 32%),
        linear-gradient(160deg, #09131f 0%, #102235 52%, #0c1827 100%);
    }

    h1,
    h2,
    p {
      margin: 0;
    }

    .eyebrow {
      margin: 0 0 10px;
      font-size: 12px;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: var(--accent);
    }
  `;
}

function dashboardLayoutStyles(): string {
  return `
    main {
      width: min(1080px, calc(100vw - 40px));
      margin: 0 auto;
      padding: 40px 0 56px;
    }

    .hero {
      padding: 32px;
      border: 1px solid var(--border);
      border-radius: 28px;
      background: linear-gradient(140deg, rgba(11, 22, 35, 0.96), rgba(20, 37, 56, 0.76));
      box-shadow: var(--shadow);
    }

    h1 {
      font-size: clamp(32px, 5vw, 56px);
      line-height: 0.95;
    }

    .hero p {
      max-width: 700px;
      margin-top: 16px;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.65;
    }

    .groups {
      display: grid;
      gap: 18px;
      margin-top: 22px;
    }

    .group {
      padding: 28px;
      border-radius: 24px;
      border: 1px solid var(--border);
      background: var(--bg-alt);
      backdrop-filter: blur(12px);
      box-shadow: var(--shadow);
    }

    .group-header {
      margin-bottom: 18px;
    }

    .group-header h2 {
      font-size: 20px;
      line-height: 1.3;
    }

    .action-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
    }
  `;
}

function dashboardCardStyles(): string {
  return `
    .action-card {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      min-height: 110px;
      padding: 18px;
      border-radius: 18px;
      text-decoration: none;
      color: inherit;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(4, 11, 18, 0.24));
      border: 1px solid rgba(151, 180, 204, 0.12);
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }

    .action-card:hover {
      transform: translateY(-2px);
      border-color: rgba(255, 180, 84, 0.5);
      background: linear-gradient(180deg, rgba(255, 180, 84, 0.14), rgba(4, 11, 18, 0.3));
    }

    .action-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 42px;
      border-radius: 14px;
      background: var(--accent-soft);
      font-size: 20px;
    }

    .action-copy {
      display: grid;
      gap: 8px;
    }

    .action-copy strong {
      font-size: 17px;
    }

    .action-copy span {
      color: var(--muted);
      line-height: 1.5;
    }
  `;
}

function dashboardResponsiveStyles(): string {
  return `
    @media (max-width: 720px) {
      main {
        width: min(100vw - 24px, 100%);
        padding: 20px 0 36px;
      }

      .hero,
      .group {
        padding: 22px;
        border-radius: 20px;
      }
    }
  `;
}

function commandUri(command: string): string {
  return `command:${command}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function iconGlyph(icon: string): string {
  switch (icon) {
    case 'book':
      return 'Bk';
    case 'symbol-method':
      return 'Rt';
    case 'database':
      return 'Db';
    case 'terminal':
      return 'Cl';
    case 'beaker':
      return 'Qa';
    case 'tools':
      return 'Mk';
    default:
      return 'Zt';
  }
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
