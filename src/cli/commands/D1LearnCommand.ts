/**
 * D1 Learn Command
 * Runs a command in "learning mode" to capture D1 SQL statements for the registry.
 */

import { BaseCommand, type CommandOptions, type IBaseCommand } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isNonEmptyString, isObject } from '@helper/index';
import * as fs from '@node-singletons/fs';
import { StatementRegistryBuild } from '@orm/SchemaStatemenWriter';
import type { Command } from 'commander';
import { spawn } from 'node:child_process';

type D1LearnOptions = CommandOptions & {
  command: string;
  output?: string;
  append?: boolean;
};

const LEARN_FILE = 'storage/d1-learned.jsonl';

const isRecord = (value: unknown): value is Record<string, unknown> => isObject(value);

const coerceStringRegistry = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (isNonEmptyString(v)) out[k] = v;
  }
  return out;
};

const readExistingRegistryFile = async (outputFile: string): Promise<Record<string, string>> => {
  try {
    await fs.stat(outputFile);
    const existingContent = await fs.readFile(outputFile, 'utf-8');
    const existingJson = JSON.parse(existingContent) as unknown;

    if (isRecord(existingJson) && 'queries' in existingJson) {
      return coerceStringRegistry(existingJson['queries']);
    }

    return coerceStringRegistry(existingJson);
  } catch {
    return {};
  }
};

const cleanLearnFile = async (): Promise<void> => {
  try {
    await fs.rm(LEARN_FILE, { force: true });
  } catch {
    // ignore
  }
};

const parseLearnedFile = async (): Promise<Record<string, string>> => {
  try {
    const content = await fs.readFile(LEARN_FILE, 'utf-8');
    return StatementRegistryBuild.fromJsonl(content);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw err;
  }
};

const runLearner = async (cmd: string, args: string[]): Promise<void> => {
  return new Promise((resolve, reject) => {
    Logger.info(`Starting learner: ${cmd} ${args.join(' ')}`);
    Logger.info(`Capturing queries to ${LEARN_FILE}...`);

    const child = spawn(cmd, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        ZT_D1_LEARN_FILE: LEARN_FILE,
        D1_REMOTE_MODE: 'sql',
      },
    });

    child.on('close', (code) => {
      // Allow code 0 or 1 (tests fail sometimes but still run queries)
      // Actually, we resolve regardless so we can harvest what ran
      if (code === 0) {
        resolve();
      } else {
        // We log error but resolve to process partial results
        Logger.error(`Command exited with code ${code}`);
        resolve();
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
};

export const D1LearnCommand = Object.freeze({
  create(): IBaseCommand {
    const cmd: IBaseCommand = BaseCommand.create({
      name: 'd1:learn',
      description: 'Run a command to learn D1 queries and generate a statement registry',
      addOptions: (c: Command) => {
        c.argument('<command>', 'The command to run (e.g. "npm test")')
          .option('-o, --output <file>', 'Output JSON file (default: d1-statements.json)')
          .option('-a, --append', 'Append to existing output file instead of overwriting');
      },
      async execute(options: CommandOptions) {
        const learnOptions = options as D1LearnOptions;
        // In BaseCommand, positional arguments are stored in options.args array
        // We defined .argument('<command>') so it's the first element.
        const commandStr = options.args && options.args.length > 0 ? options.args[0] : '';

        if (commandStr === '') {
          Logger.error('Missing command argument');
          return;
        }

        const outputFile = learnOptions.output ?? 'd1-statements.json';
        const append = learnOptions.append === true;

        // 1. Prepare
        await cleanLearnFile();
        const parts = commandStr.split(' ');
        const cmdExe = parts[0];
        const args = parts.slice(1);

        // 2. Run command
        try {
          await runLearner(cmdExe, args);
        } catch (err) {
          throw ErrorFactory.createCliError(`Learner failed to start: ${(err as Error).message}`);
        }

        // 3. Process results
        const learned = await parseLearnedFile();
        const count = Object.keys(learned).length;

        if (count === 0) {
          Logger.warn('No D1 queries were captured.');
          return;
        }

        Logger.info(`Captured ${count} unique queries.`);

        // 4. Merge with existing if needed
        let finalMap = learned;
        if (append) {
          const existingMap = await readExistingRegistryFile(outputFile);
          finalMap = StatementRegistryBuild.merge(existingMap, learned);
        }

        // 5. Output
        // One-line JSON is easiest to paste into `wrangler secret put ZT_D1_STATEMENTS_JSON`.
        const outputContent = StatementRegistryBuild.toStatementsJson(finalMap);

        await fs.writeFile(outputFile, outputContent);
        Logger.info(`Registry written to ${outputFile}`);
      },
    });

    return cmd;
  },
});
