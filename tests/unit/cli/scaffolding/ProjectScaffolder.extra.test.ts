/* eslint-disable no-empty */
import {
  createProjectScaffolder,
  getAvailableTemplates,
  getTemplate,
  validateOptions,
} from '@cli/scaffolding/ProjectScaffolder';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const tmpRoot = path.join(os.tmpdir(), `zintrust-scaffold-${Date.now()}`);

describe('ProjectScaffolder extra tests', () => {
  it('validateOptions returns errors for bad input', () => {
    expect(validateOptions({ name: '' as unknown as string })).toEqual(
      expect.objectContaining({ valid: false })
    );
    expect(validateOptions({ name: 'Invalid Name' as unknown as string }).valid).toBe(false);
    expect(validateOptions({ name: 'ok', port: 70000 }).valid).toBe(false);
    expect(validateOptions({ name: 'ok', template: 'does-not-exist' }).valid).toBe(false);
  });

  it('scaffolds a basic project and creates files', async () => {
    const projectPath = path.join(tmpRoot, 'myapp');
    try {
      await fsPromises.rm(projectPath, { recursive: true, force: true });
    } catch {}

    const result = await createProjectScaffolder(tmpRoot).scaffold({ name: 'myapp' });
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(projectPath, '.env'))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, '.zintrust.json'))).toBe(true);

    // cleanup
    await fsPromises.rm(projectPath, { recursive: true, force: true });
  });

  it('getAvailableTemplates contains basic template', () => {
    const templates = getAvailableTemplates();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates).toContain('basic');
  });

  it('createFiles renders paths and content from template with various variable types', async () => {
    const templateName = 'basic';
    const templateRoot = path.join(__dirname, '../../../../src/templates/project', templateName);

    // create a file with templated path and content inside the existing 'basic' template
    const tplPath = path.join(templateRoot, 'config', '{{projectName}}.json.tpl');
    await fsPromises.mkdir(path.dirname(tplPath), { recursive: true });
    const content =
      '{"port": {{port}}, "author": "{{author}}", "flag": "{{flag}}", "obj": {{obj}}, "fun": "{{fun}}", "sym": "{{sym}}"}';
    await fsPromises.writeFile(tplPath, content);

    const projectPath = path.join(tmpRoot, `project-${Date.now()}`);
    try {
      await fsPromises.rm(projectPath, { recursive: true, force: true });
    } catch {}

    const scaffolder = createProjectScaffolder(tmpRoot);
    scaffolder.prepareContext({
      name: path.basename(projectPath),
      template: templateName,
      port: 4321,
      author: 'Alice',
      database: 'sqlite',
    });

    // mutate variables to include function, symbol and object
    const vars = scaffolder.getVariables();
    // @ts-ignore - injecting test-only variables
    vars.flag = true;
    // @ts-ignore
    vars.obj = { x: 1 };
    // @ts-ignore
    vars.fun = () => 42;
    // @ts-ignore
    vars.sym = Symbol('S');

    const filesCreated = scaffolder.createFiles();
    expect(filesCreated).toBeGreaterThan(0);

    const generated = path.join(
      scaffolder.getProjectPath(),
      'config',
      `${vars['projectName']}.json`
    );
    expect(fs.existsSync(generated)).toBe(true);
    const txt = await fsPromises.readFile(generated, 'utf8');
    expect(txt).toContain('"port": 4321');
    expect(txt).toContain('"author": "Alice"');
    expect(txt).toContain('"obj": {"x":1}');
    expect(txt).toContain('"fun": "[Function]"');

    // cleanup
    await fsPromises.rm(projectPath, { recursive: true, force: true });
    await fsPromises.rm(tplPath, { force: true });
  });

  it('createEnvFile writes postgres database lines and respects existing .env', async () => {
    const projectPath = path.join(tmpRoot, `env-project-${Date.now()}`);
    await fsPromises.rm(projectPath, { recursive: true, force: true });

    const scaffolder = createProjectScaffolder(tmpRoot);
    scaffolder.prepareContext({
      name: path.basename(projectPath),
      port: 1111,
      database: 'postgresql',
    });

    // ensure env is created
    expect(scaffolder.createEnvFile()).toBe(true);
    const envPath = path.join(scaffolder.getProjectPath(), '.env');
    expect(fs.existsSync(envPath)).toBe(true);
    const env = await fsPromises.readFile(envPath, 'utf8');
    expect(env).toContain('DB_PORT=5432');
    expect(env).toContain('DB_USERNAME=postgres');

    // create a .env file and call again - should not overwrite
    await fsPromises.writeFile(envPath, 'CUSTOM=1\n');
    expect(scaffolder.createEnvFile()).toBe(true);
    const env2 = await fsPromises.readFile(envPath, 'utf8');
    expect(env2).toContain('CUSTOM=1');

    // cleanup
    await fsPromises.rm(projectPath, { recursive: true, force: true });
  });

  it('createProjectConfigFile writes .zintrust.json with correct values', async () => {
    const projectPath = path.join(tmpRoot, `config-project-${Date.now()}`);
    await fsPromises.rm(projectPath, { recursive: true, force: true });

    const scaffolder = createProjectScaffolder(tmpRoot);
    scaffolder.prepareContext({ name: path.basename(projectPath), port: 2222, database: 'sqlite' });
    expect(scaffolder.createConfigFile()).toBe(true);

    const cfgPath = path.join(scaffolder.getProjectPath(), '.zintrust.json');
    const cfg = JSON.parse(await fsPromises.readFile(cfgPath, 'utf8'));
    expect(cfg.server.port).toBe(2222);
    expect(cfg.database.connection).toBe('sqlite');

    await fsPromises.rm(projectPath, { recursive: true, force: true });
  });

  it('scaffold returns error if directory exists and supports overwrite option', async () => {
    const projectPath = path.join(tmpRoot, `exist-project-${Date.now()}`);
    await fsPromises.mkdir(projectPath, { recursive: true });

    const scaffolder = createProjectScaffolder(tmpRoot);
    const r1 = await scaffolder.scaffold({ name: path.basename(projectPath) });
    expect(r1.success).toBe(false);
    expect(r1.message).toContain('already exists');

    const r2 = await scaffolder.scaffold({ name: path.basename(projectPath), overwrite: true });
    // should succeed with overwrite
    expect(r2.success).toBe(true);

    await fsPromises.rm(projectPath, { recursive: true, force: true });
  });

  it('getTemplate falls back to defaults when template.json is invalid JSON', async () => {
    const templateDir = path.join(__dirname, '../../../../src/templates/project/basic');
    const tplJsonPath = path.join(templateDir, 'template.json');
    const backup = await fsPromises.readFile(tplJsonPath, 'utf8');

    // write invalid JSON and create a sample file
    await fsPromises.writeFile(tplJsonPath, '{ invalid json');
    const samplePath = path.join(templateDir, 'SAMPLE.tpl');
    await fsPromises.writeFile(samplePath, 'SAMPLE CONTENT');

    try {
      const tpl = getTemplate('basic');
      expect(tpl).toBeDefined();
      expect(tpl?.name).toBe('basic'); // fallback name should remain
      expect(Object.keys(tpl?.files ?? {})).toContain('SAMPLE');
    } finally {
      // restore
      await fsPromises.writeFile(tplJsonPath, backup);
      await fsPromises.rm(samplePath, { force: true });
    }
  });
});
