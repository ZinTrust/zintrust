import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { ProxyRegistry } from '@proxy/ProxyRegistry';
import '@proxy/d1/register';
import '@proxy/kv/register';
import '@proxy/mysql/register';
import '@proxy/postgres/register';

export const ProxyCommand = Object.freeze({
  create(): IBaseCommand {
    const cmd: IBaseCommand = BaseCommand.create({
      name: 'proxy',
      description: 'List available proxy servers',
      execute: (_options: CommandOptions): void => {
        const list = ProxyRegistry.list();
        if (list.length === 0) {
          throw ErrorFactory.createCliError('No proxies registered');
        }

        for (const proxy of list) {
          cmd.info(`${proxy.name}: ${proxy.description}`);
        }
      },
    });

    return cmd;
  },
});

export default ProxyCommand;
