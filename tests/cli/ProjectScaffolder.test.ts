import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { ProjectOptions, ProjectScaffolder } from '@cli/scaffolding/ProjectScaffolder';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const testDir = path.join(__dirname, 'test-projects');

describe('ProjectScaffolder Templates', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should return list of available templates', () => {
    const templates = ProjectScaffolder.getAvailableTemplates();

    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
    expect(templates).toContain('basic');
    expect(templates).toContain('api');
  });

  it('should return template by name', () => {
    const template = ProjectScaffolder.getTemplate('basic');

    expect(template).toBeDefined();
    expect(template?.name).toBe('basic');
    expect(template?.directories).toBeDefined();
    expect(template?.files).toBeDefined();
  });

  it('should return undefined for unknown template', () => {
    const template = ProjectScaffolder.getTemplate('unknown');
    expect(template).toBeUndefined();
  });
});

describe('ProjectScaffolder Validation Basic', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should validate valid options', () => {
    const options: ProjectOptions = {
      name: 'my-app',
      template: 'basic',
      port: 3000,
    };

    const result = ProjectScaffolder.validateOptions(options);

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should reject missing project name', () => {
    const options: ProjectOptions = {
      name: '',
    };

    const result = ProjectScaffolder.validateOptions(options);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Project name is required');
  });

  it('should reject invalid project name', () => {
    const options: ProjectOptions = {
      name: 'My Project!',
    };

    const result = ProjectScaffolder.validateOptions(options);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Project name must contain only lowercase letters, numbers, hyphens, and underscores'
    );
  });
});

describe('ProjectScaffolder Validation Advanced', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should reject invalid template', () => {
    const options: ProjectOptions = {
      name: 'my-app',
      template: 'unknown',
    };

    const result = ProjectScaffolder.validateOptions(options);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Template "unknown" not found');
  });

  it('should reject invalid port', () => {
    const options: ProjectOptions = {
      name: 'my-app',
      port: 99999,
    };

    const result = ProjectScaffolder.validateOptions(options);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Port must be a number between 1 and 65535');
  });

  it('should accept port 1 and 65535', () => {
    const result1 = ProjectScaffolder.validateOptions({
      name: 'app1',
      port: 1,
    });

    const result2 = ProjectScaffolder.validateOptions({
      name: 'app2',
      port: 65535,
    });

    expect(result1.valid).toBe(true);
    expect(result2.valid).toBe(true);
  });
});

describe('ProjectScaffolder Context and Preparation Basic', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should prepare scaffolding context', () => {
    const scaffolder = ProjectScaffolder.create(testDir);
    const options: ProjectOptions = {
      name: 'my-app',
      author: 'John Doe',
      description: 'My awesome app',
      port: 3001,
      database: 'postgresql',
    };

    scaffolder.prepareContext(options);
    const variables = scaffolder.getVariables();

    expect(variables['projectName']).toBe('my-app');
    expect(variables['projectSlug']).toBe('my-app');
    expect(variables['author']).toBe('John Doe');
    expect(variables['description']).toBe('My awesome app');
    expect(variables['port']).toBe(3001);
    expect(variables['database']).toBe('postgresql');
  });

  it('should use defaults for optional fields', () => {
    const scaffolder = ProjectScaffolder.create(testDir);
    const options: ProjectOptions = {
      name: 'my-app',
    };

    scaffolder.prepareContext(options);
    const variables = scaffolder.getVariables();

    expect(variables['author']).toBe('Your Name');
    expect(variables['port']).toBe(3000);
    expect(variables['database']).toBe('sqlite');
  });
});

describe('ProjectScaffolder Template Loading', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should load correct template', () => {
    const scaffolder = ProjectScaffolder.create(testDir);
    const options: ProjectOptions = {
      name: 'my-app',
      template: 'api',
    };

    scaffolder.prepareContext(options);
    const template = scaffolder.getTemplateInfo();

    expect(template?.name).toBe('api');
  });
});

describe('ProjectScaffolder Context and Preparation Paths', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should set project path correctly', () => {
    const scaffolder = ProjectScaffolder.create(testDir);
    const options: ProjectOptions = {
      name: 'my-app',
    };

    scaffolder.prepareContext(options);
    expect(scaffolder.getProjectPath()).toBe(path.join(testDir, 'my-app'));
  });

  it('should return false for non-existing directory', () => {
    const scaffolder = ProjectScaffolder.create(testDir);
    scaffolder.prepareContext({ name: 'new-app' });

    expect(scaffolder.projectDirectoryExists()).toBe(false);
  });

  it('should return true for existing directory', () => {
    const projectPath = path.join(testDir, 'existing-app');
    FileGenerator.createDirectory(projectPath);

    const scaffolder = ProjectScaffolder.create(testDir);
    scaffolder.prepareContext({ name: 'existing-app' });

    expect(scaffolder.projectDirectoryExists()).toBe(true);
  });
});

describe('ProjectScaffolder Scaffolding Execution', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should create project directories', () => {
    const scaffolder = ProjectScaffolder.create(testDir);
    scaffolder.prepareContext({ name: 'my-app' });
    FileGenerator.createDirectory(scaffolder.getProjectPath());

    const count = scaffolder.createDirectories();

    expect(count).toBeGreaterThan(0);
    expect(FileGenerator.directoryExists(path.join(scaffolder.getProjectPath(), 'src'))).toBe(true);
    expect(FileGenerator.directoryExists(path.join(scaffolder.getProjectPath(), 'routes'))).toBe(
      true
    );
  });

  it('should create project files', () => {
    const scaffolder = ProjectScaffolder.create(testDir);
    const projectPath = path.join(testDir, 'my-app');
    scaffolder.prepareContext({ name: 'my-app' });
    FileGenerator.createDirectory(projectPath);
    scaffolder.createDirectories();

    const count = scaffolder.createFiles();

    expect(count).toBeGreaterThan(0);
    expect(FileGenerator.fileExists(path.join(projectPath, 'package.json'))).toBe(true);
    expect(FileGenerator.fileExists(path.join(projectPath, '.gitignore'))).toBe(true);
  });

  it('should render template variables in files', () => {
    const scaffolder = ProjectScaffolder.create(testDir);
    const projectPath = path.join(testDir, 'my-app');
    scaffolder.prepareContext({ name: 'my-app', author: 'Jane Doe' });
    FileGenerator.createDirectory(projectPath);
    scaffolder.createDirectories();
    scaffolder.createFiles();

    const packageJson = FileGenerator.readFile(path.join(projectPath, 'package.json'));
    expect(packageJson).toContain('my-app');
  });
});

describe('ProjectScaffolder Configuration', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should create .zintrust.json', () => {
    const scaffolder = ProjectScaffolder.create(testDir);
    const projectPath = path.join(testDir, 'my-app');
    scaffolder.prepareContext({ name: 'my-app' });
    FileGenerator.createDirectory(projectPath);

    const result = scaffolder.createConfigFile();

    expect(result).toBe(true);
    const configPath = path.join(projectPath, '.zintrust.json');
    expect(FileGenerator.fileExists(configPath)).toBe(true);

    const config = JSON.parse(FileGenerator.readFile(configPath));
    expect(config.name).toBe('my-app');
    expect(config.database).toBeDefined();
    expect(config.server).toBeDefined();
  });

  it('should create .env file', () => {
    const scaffolder = ProjectScaffolder.create(testDir);
    const projectPath = path.join(testDir, 'my-app');
    scaffolder.prepareContext({ name: 'my-app', port: 3001 });
    FileGenerator.createDirectory(projectPath);

    const result = scaffolder.createEnvFile();

    expect(result).toBe(true);
    const envPath = path.join(projectPath, '.env');
    expect(FileGenerator.fileExists(envPath)).toBe(true);

    const env = FileGenerator.readFile(envPath);
    expect(env).toContain('APP_NAME=my-app');
    expect(env).toContain('APP_PORT=3001');
  });
});

describe('ProjectScaffolder Database Configuration', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should create PostgreSQL env for PostgreSQL projects', () => {
    const scaffolder = ProjectScaffolder.create(testDir);
    const projectPath = path.join(testDir, 'my-app');
    scaffolder.prepareContext({ name: 'my-app', database: 'postgresql' });
    FileGenerator.createDirectory(projectPath);

    scaffolder.createEnvFile();
    const env = FileGenerator.readFile(path.join(projectPath, '.env'));

    expect(env).toContain('DB_CONNECTION=postgresql');
    expect(env).toContain('DB_HOST=localhost');
    expect(env).toContain('DB_PORT=5432');
  });

  it('should create SQLite env for SQLite projects', () => {
    const scaffolder = ProjectScaffolder.create(testDir);
    const projectPath = path.join(testDir, 'my-app');
    scaffolder.prepareContext({ name: 'my-app', database: 'sqlite' });
    FileGenerator.createDirectory(projectPath);

    scaffolder.createEnvFile();
    const env = FileGenerator.readFile(path.join(projectPath, '.env'));

    expect(env).toContain('DB_CONNECTION=sqlite');
    expect(env).toContain('DB_DATABASE=./database.sqlite');
  });
});

describe('ProjectScaffolder Full Scaffolding', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should create complete project', async () => {
    const scaffolder = ProjectScaffolder.create(testDir);
    const options: ProjectOptions = {
      name: 'my-app',
      author: 'John Doe',
      description: 'Test app',
      port: 3000,
      database: 'sqlite',
    };

    const result = await scaffolder.scaffold(options);

    expect(result.success).toBe(true);
    expect(result.filesCreated).toBeGreaterThan(0);
    expect(result.directoriesCreated).toBeGreaterThan(0);
    expect(FileGenerator.directoryExists(path.join(testDir, 'my-app'))).toBe(true);
  });

  it('should fail with invalid options', async () => {
    const scaffolder = ProjectScaffolder.create(testDir);
    const options: ProjectOptions = {
      name: 'My Invalid App!',
    };

    const result = await scaffolder.scaffold(options);

    expect(result.success).toBe(false);
    expect(result.error ?? result.message).toBeDefined();
  });
});

describe('ProjectScaffolder Overwrite', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should fail if directory exists without overwrite', async () => {
    const projectPath = path.join(testDir, 'existing');
    FileGenerator.createDirectory(projectPath);

    const scaffolder = ProjectScaffolder.create(testDir);
    const options: ProjectOptions = {
      name: 'existing',
      overwrite: false,
    };

    const result = await scaffolder.scaffold(options);

    expect(result.success).toBe(false);
    expect(result.message).toContain('already exists');
  });

  it('should succeed with overwrite option', async () => {
    const projectPath = path.join(testDir, 'my-app');
    FileGenerator.createDirectory(projectPath);
    FileGenerator.writeFile(path.join(projectPath, 'old-file.txt'), 'old');

    const scaffolder = ProjectScaffolder.create(testDir);
    const options: ProjectOptions = {
      name: 'my-app',
      overwrite: true,
    };

    const result = await scaffolder.scaffold(options);

    expect(result.success).toBe(true);
  });
});

describe('ProjectScaffolder Requirements', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should create required files and directories', async () => {
    const scaffolder = ProjectScaffolder.create(testDir);
    const options: ProjectOptions = {
      name: 'my-app',
      template: 'basic',
    };

    const result = await scaffolder.scaffold(options);

    expect(result.success).toBe(true);
    const projectPath = path.join(testDir, 'my-app');
    expect(FileGenerator.fileExists(path.join(projectPath, 'package.json'))).toBe(true);
    expect(FileGenerator.fileExists(path.join(projectPath, '.env'))).toBe(true);
    expect(FileGenerator.fileExists(path.join(projectPath, '.zintrust.json'))).toBe(true);
    expect(FileGenerator.directoryExists(path.join(projectPath, 'src'))).toBe(true);
  });
});
