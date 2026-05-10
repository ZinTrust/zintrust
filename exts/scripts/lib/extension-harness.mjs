import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

export const workspaceRoot = path.resolve(scriptsDir, '..', '..');
export const repoRoot = path.resolve(workspaceRoot, '..');
export const extensionDirs = readdirSync(workspaceRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('zintrust-'))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right));

export function createHarness() {
  const require = Module.createRequire(import.meta.url);
  const registeredCommands = new Map();
  const sideEffects = createSideEffects();
  const workspaceFolder = {
    index: 0,
    name: 'zintrust',
    uri: createUri(repoRoot),
  };

  const mockVscode = createMockVscode({ registeredCommands, sideEffects, workspaceFolder });
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
      return mockVscode;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  return {
    extensionDirs,
    registeredCommands,
    sideEffects,
    workspaceFolder,
    loadExtension(extensionDir) {
      const manifest = readManifest(extensionDir);
      if (!manifest.main) {
        return { extensionDir, manifest };
      }

      const manifestMain =
        typeof manifest.main === 'string' && manifest.main.startsWith('./')
          ? manifest.main.slice(2)
          : manifest.main;
      const extensionEntry = path.join(workspaceRoot, extensionDir, manifestMain);
      delete require.cache[extensionEntry];
      registeredCommands.clear();

      const extensionModule = require(extensionEntry);
      const context = {
        subscriptions: [],
        extensionUri: createUri(path.join(workspaceRoot, extensionDir)),
      };

      extensionModule.activate(context);
      return { extensionDir, manifest, extensionModule, context };
    },
    readManifest,
    resetSideEffects() {
      resetSideEffects(sideEffects);
    },
    restore() {
      Module._load = originalLoad;
    },
  };
}

function createMockVscode({ registeredCommands, sideEffects, workspaceFolder }) {
  return {
    EventEmitter,
    CompletionItem,
    CompletionItemKind: {
      Function: 3,
    },
    MarkdownString,
    Position,
    RelativePattern,
    Range,
    ThemeIcon,
    TextEdit,
    TreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    StatusBarAlignment: {
      Left: 1,
      Right: 2,
    },
    ViewColumn: {
      One: 1,
    },
    Uri: {
      joinPath(baseUri, ...segments) {
        return createUri(path.join(baseUri.fsPath, ...segments));
      },
    },
    languages: {
      registerCompletionItemProvider(selector, provider) {
        sideEffects.completionProviders.push({ selector, provider });
        return { dispose() {} };
      },
    },
    commands: {
      registerCommand(command, handler) {
        registeredCommands.set(command, handler);
        return { dispose() {} };
      },
      async executeCommand(command, ...args) {
        sideEffects.executedCommands.push({ command, args });
      },
    },
    window: {
      activeTextEditor: undefined,
      terminals: [],
      async showQuickPick(items) {
        if (Array.isArray(items)) {
          return items[0];
        }

        const resolved = [];
        for await (const item of items) {
          resolved.push(item);
        }
        return resolved[0];
      },
      async showInputBox(options = {}) {
        const prompt = `${options.prompt ?? ''} ${options.placeHolder ?? ''}`.toLowerCase();
        if (prompt.includes('search')) return 'routing';
        if (prompt.includes('schedule')) return 'jobTracking.cleanup';
        if (prompt.includes('env key')) return 'JWT_SECRET';
        if (prompt.includes('model')) return 'user';
        if (prompt.includes('template')) return 'welcome';
        if (prompt.includes('name')) return 'example';
        return 'example';
      },
      async showTextDocument(document) {
        sideEffects.openedDocuments.push(document.uri.fsPath);
        return { document };
      },
      async showErrorMessage(message) {
        sideEffects.messages.push({ type: 'error', message });
      },
      async showWarningMessage(message) {
        sideEffects.messages.push({ type: 'warning', message });
      },
      async showInformationMessage(message) {
        sideEffects.messages.push({ type: 'info', message });
      },
      createTerminal(options) {
        const terminal = {
          name: options.name,
          cwd: options.cwd,
          show() {
            sideEffects.terminals.push(options.name);
          },
          sendText(text) {
            sideEffects.terminalCommands.push(text);
          },
          dispose() {},
        };

        this.terminals.push(terminal);
        return terminal;
      },
      createTreeView(viewId, options) {
        sideEffects.treeViews.push({ viewId, options });
        return {
          dispose() {},
        };
      },
      createStatusBarItem(alignment, priority) {
        const record = {
          alignment,
          priority,
          text: '',
          tooltip: undefined,
          command: undefined,
          shown: false,
        };
        sideEffects.statusBarItems.push(record);

        return {
          get text() {
            return record.text;
          },
          set text(value) {
            record.text = value;
          },
          get tooltip() {
            return record.tooltip;
          },
          set tooltip(value) {
            record.tooltip = value;
          },
          get command() {
            return record.command;
          },
          set command(value) {
            record.command = value;
          },
          show() {
            record.shown = true;
          },
          hide() {
            record.shown = false;
          },
          dispose() {},
        };
      },
      createWebviewPanel(viewType, title, column, options) {
        const record = {
          viewType,
          title,
          column,
          options,
          html: '',
          revealed: false,
        };
        const disposeListeners = [];
        sideEffects.webviewPanels.push(record);

        const panel = {
          get title() {
            return record.title;
          },
          set title(value) {
            record.title = value;
          },
          webview: {
            get html() {
              return record.html;
            },
            set html(value) {
              record.html = value;
            },
          },
          reveal() {
            record.revealed = true;
          },
          onDidDispose(listener) {
            disposeListeners.push(listener);
            return { dispose() {} };
          },
          dispose() {
            for (const listener of disposeListeners) {
              listener();
            }
          },
        };

        return panel;
      },
    },
    workspace: {
      workspaceFolders: [workspaceFolder],
      getWorkspaceFolder() {
        return workspaceFolder;
      },
      asRelativePath(uri) {
        return path
          .relative(repoRoot, typeof uri === 'string' ? uri : uri.fsPath)
          .replaceAll('\\', '/');
      },
      async findFiles(pattern) {
        const basePath = typeof pattern === 'string' ? repoRoot : pattern.baseUri.fsPath;
        const filePattern = typeof pattern === 'string' ? pattern : pattern.pattern;
        return collectMatchingFiles(basePath, filePattern).map((filePath) => createUri(filePath));
      },
      async openTextDocument(uri) {
        const filePath = typeof uri === 'string' ? uri : uri.fsPath;
        const text = readFileSync(filePath, 'utf8');
        return {
          uri: typeof uri === 'string' ? createUri(uri) : uri,
          getText() {
            return text;
          },
        };
      },
      fs: {
        async stat(uri) {
          return statSync(uri.fsPath);
        },
        async createDirectory(uri) {
          mkdirSync(uri.fsPath, { recursive: true });
        },
        async writeFile(uri, content) {
          await fsPromises.mkdir(path.dirname(uri.fsPath), { recursive: true });
          await fsPromises.writeFile(uri.fsPath, content);
          sideEffects.writtenFiles.push(uri.fsPath);
        },
      },
    },
  };
}

function createUri(fsPath) {
  const normalizedPath = path.resolve(fsPath);
  return {
    fsPath: normalizedPath,
    toString() {
      return pathToFileURL(normalizedPath).toString();
    },
  };
}

function createSideEffects() {
  return {
    completionProviders: [],
    executedCommands: [],
    messages: [],
    openedDocuments: [],
    statusBarItems: [],
    terminalCommands: [],
    terminals: [],
    treeViews: [],
    webviewPanels: [],
    writtenFiles: [],
  };
}

function resetSideEffects(sideEffects) {
  sideEffects.completionProviders.length = 0;
  sideEffects.executedCommands.length = 0;
  sideEffects.messages.length = 0;
  sideEffects.openedDocuments.length = 0;
  sideEffects.statusBarItems.length = 0;
  sideEffects.terminalCommands.length = 0;
  sideEffects.terminals.length = 0;
  sideEffects.treeViews.length = 0;
  sideEffects.webviewPanels.length = 0;
  sideEffects.writtenFiles.length = 0;
}

function CompletionItem(label, kind) {
  this.label = label;
  this.kind = kind;
}

function MarkdownString(value) {
  this.value = value;
}

function Position(line, character) {
  this.line = line;
  this.character = character;
}

Position.prototype.translate = function translate(lineDelta, characterDelta) {
  return new Position(this.line + lineDelta, this.character + characterDelta);
};

function Range(start, end) {
  this.start = start;
  this.end = end;
}

const TextEdit = {
  insert(position, newText) {
    return { range: new Range(position, position), newText };
  },
  replace(range, newText) {
    return { range, newText };
  },
};

function readManifest(extensionDir) {
  const manifestPath = path.join(workspaceRoot, extensionDir, 'package.json');
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function collectMatchingFiles(basePath, pattern) {
  const allFiles = collectFiles(basePath);
  const normalized = allFiles.map((filePath) => ({
    filePath,
    relativePath: path.relative(basePath, filePath).replaceAll('\\', '/'),
  }));
  const regexes = expandBraces(pattern).map((item) => globToRegExp(item));

  return normalized
    .filter((item) => regexes.some((regex) => regex.test(item.relativePath)))
    .map((item) => item.filePath);
}

function collectFiles(basePath) {
  const entries = readdirSync(basePath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (
      entry.name === '.git' ||
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === 'coverage'
    ) {
      continue;
    }

    const fullPath = path.join(basePath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function expandBraces(pattern) {
  const match = /\{([^{}]+)\}/.exec(pattern);
  if (!match) {
    return [pattern];
  }

  const options = match[1].split(',');
  const prefix = pattern.slice(0, match.index);
  const suffix = pattern.slice(match.index + match[0].length);

  return options.flatMap((option) => expandBraces(`${prefix}${option}${suffix}`));
}

function EventEmitter() {
  const listeners = [];
  this.event = (listener) => {
    listeners.push(listener);
    return {
      dispose() {},
    };
  };
  this.fire = (value) => {
    for (const listener of listeners) {
      listener(value);
    }
  };
  this.dispose = () => {
    listeners.length = 0;
  };
}

function RelativePattern(base, pattern) {
  this.baseUri = base?.uri ?? base;
  this.pattern = pattern;
}

function ThemeIcon(id) {
  this.id = id;
}

function TreeItem(label, collapsibleState) {
  this.label = label;
  this.collapsibleState = collapsibleState;
}

function globToRegExp(pattern) {
  let regex = '^';

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    const nextCharacter = pattern[index + 1];
    const thirdCharacter = pattern[index + 2];

    if (character === '*' && nextCharacter === '*' && thirdCharacter === '/') {
      regex += '(?:.*/)?';
      index += 2;
      continue;
    }

    if (character === '*' && nextCharacter === '*') {
      regex += '.*';
      index += 1;
      continue;
    }

    if (character === '*') {
      regex += '[^/]*';
      continue;
    }

    regex += /[|\\{}()[\]^$+?.]/.test(character) ? `\\${character}` : character;
  }

  regex += '$';
  return new RegExp(regex);
}
