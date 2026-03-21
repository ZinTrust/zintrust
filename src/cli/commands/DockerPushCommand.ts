import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { VersionChecker } from '@cli/services/VersionChecker';
import { SpawnUtil } from '@cli/utils/spawn';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { Command } from 'commander';

type DockerPushOptions = CommandOptions & {
  tag?: string;
  platforms?: string;
  alsoLatest?: boolean;
  only?: string;
};

const parsePlatforms = (value: string | undefined): string => {
  const raw = (value ?? '').trim();
  if (raw !== '') return raw;
  return 'linux/amd64,linux/arm64';
};

const parseTag = (value: string | undefined): string => {
  const raw = (value ?? '').trim();
  if (raw === '') {
    const currentVersion = VersionChecker.getCurrentVersion();
    return currentVersion === '0.0.0' ? 'latest' : currentVersion;
  }
  return raw;
};

const resolvePublishTags = (tag: string, alsoLatest: boolean | undefined): string[] => {
  if (tag === 'latest') return ['latest'];
  if (alsoLatest === false) return [tag];
  return [tag, 'latest'];
};

const parseOnly = (value: string | undefined): 'runtime' | 'worker' | 'gateway' | 'both' => {
  const raw = (value ?? '').trim().toLowerCase();
  if (raw === 'runtime' || raw === 'worker' || raw === 'gateway') return raw;
  return 'both';
};

const runPublishImages = async (options: DockerPushOptions): Promise<void> => {
  const tag = parseTag(options.tag);
  const platforms = parsePlatforms(options.platforms);
  const tags = resolvePublishTags(tag, options.alsoLatest);
  const only = parseOnly(options.only);

  const runtimeRepo = 'zintrust/zintrust';
  const workerRepo = 'zintrust/zintrust-worker';
  const gatewayRepo = 'zintrust/zintrust-proxy-gateway';

  const buildArgsFor = (repo: string, context: string, target?: string): string[] => {
    const args: string[] = ['buildx', 'build', '--platform', platforms];
    for (const t of tags) args.push('-t', `${repo}:${t}`);
    if (typeof target === 'string' && target.trim() !== '') {
      args.push('--target', target);
    }
    args.push('--push', context);
    return args;
  };

  Logger.info('Publishing images to Docker Hub via buildx...', {
    runtime: runtimeRepo,
    worker: workerRepo,
    gateway: gatewayRepo,
    platforms,
    tags,
    only,
  });

  if (only === 'runtime' || only === 'both') {
    const runtimeExit = await SpawnUtil.spawnAndWait({
      command: 'docker',
      args: buildArgsFor(runtimeRepo, '.', 'runtime'),
      env: process.env,
    });
    if (runtimeExit !== 0) {
      throw ErrorFactory.createCliError(
        `Failed to publish ${runtimeRepo} (exit code ${runtimeExit})`
      );
    }
  }

  if (only === 'worker' || only === 'both') {
    const workerExit = await SpawnUtil.spawnAndWait({
      command: 'docker',
      args: buildArgsFor(workerRepo, '.', 'worker'),
      env: process.env,
    });
    if (workerExit !== 0) {
      throw ErrorFactory.createCliError(
        `Failed to publish ${workerRepo} (exit code ${workerExit})`
      );
    }
  }

  if (only === 'gateway' || only === 'both') {
    const gatewayExit = await SpawnUtil.spawnAndWait({
      command: 'docker',
      args: buildArgsFor(gatewayRepo, './docker/proxy-gateway'),
      env: process.env,
    });
    if (gatewayExit !== 0) {
      throw ErrorFactory.createCliError(
        `Failed to publish ${gatewayRepo} (exit code ${gatewayExit})`
      );
    }
  }
};

export const DockerPushCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'docker:push',
      aliases: ['docker-push'],
      description: 'Build and push ZinTrust Docker images to Docker Hub',
      addOptions: (command: Command): void => {
        command.option(
          '--tag <tag>',
          'Docker image tag to publish. Defaults to current version and also tags :latest'
        );
        command.option(
          '--platforms <list>',
          'Comma-separated platforms for buildx',
          'linux/amd64,linux/arm64'
        );
        command.option(
          '--no-also-latest',
          'When publishing a non-latest --tag, do not also push :latest'
        );
        command.option(
          '--only <target>',
          'Publish only one image: runtime|worker|gateway|both',
          'both'
        );
      },
      execute: async (options: DockerPushOptions): Promise<void> => {
        await runPublishImages(options);
      },
    });
  },
});
