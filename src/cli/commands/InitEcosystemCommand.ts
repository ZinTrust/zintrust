import { BaseCommand, type IBaseCommand } from '@cli/BaseCommand';
import { PromptHelper } from '@cli/PromptHelper';
import { Logger } from '@config/logger';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';
import { fileURLToPath } from '@node-singletons/url';

const backupSuffix = (): string => new Date().toISOString().replaceAll(/[:.]/g, '-');

const backupFileIfExists = (filePath: string): void => {
  if (!existsSync(filePath)) return;
  const backupPath = `${filePath}.bak.${backupSuffix()}`;
  copyFileSync(filePath, backupPath);
  Logger.info(`🗂️ Backup created: ${backupPath}`);
};

const readTemplate = (relPathFromThisModule: string): string => {
  const absPath = fileURLToPath(new URL(relPathFromThisModule, import.meta.url));
  return readFileSync(absPath, 'utf-8');
};

const TEMPLATE_ECOSYSTEM = readTemplate('../../templates/docker/docker-compose.ecosystem.yml.tpl');
const TEMPLATE_SCHEDULES = readTemplate('../../templates/docker/docker-compose.schedules.yml.tpl');

const writeScaffoldFile = async (cwd: string, fileName: string, content: string): Promise<void> => {
  const outPath = join(cwd, fileName);

  let shouldWrite = true;
  if (existsSync(outPath)) {
    shouldWrite = await PromptHelper.confirm(`${fileName} already exists. Overwrite?`, false);
  }

  if (!shouldWrite) {
    Logger.info(`Skipped ${fileName}`);
    return;
  }

  backupFileIfExists(outPath);
  writeFileSync(outPath, content);
  Logger.info(`✅ Created ${fileName}`);
};

const execute = async (): Promise<void> => {
  const cwd = process.cwd();

  await writeScaffoldFile(cwd, 'docker-compose.ecosystem.yml', TEMPLATE_ECOSYSTEM);
  await writeScaffoldFile(cwd, 'docker-compose.schedules.yml', TEMPLATE_SCHEDULES);

  Logger.info('✅ Ecosystem scaffolding complete.');
  Logger.info('Next: docker compose -f docker-compose.ecosystem.yml up -d');
};

export const InitEcosystemCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'init:ecosystem',
      description: 'Scaffold docker-compose.ecosystem.yml and docker-compose.schedules.yml',
      execute,
    });
  },
});

export default InitEcosystemCommand;
