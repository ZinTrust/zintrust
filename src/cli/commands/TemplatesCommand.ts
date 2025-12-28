import { BaseCommand } from '@cli/BaseCommand';
import { ErrorHandler } from '@cli/ErrorHandler';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { listTemplates as listMail, renderTemplate as renderMail } from '@mail/templates/markdown';
import {
  listTemplates as listNotification,
  renderTemplate as renderNotification,
} from '@notification/templates/markdown';

const listForScope = (scope: string): string[] => {
  let items: string[] = [];
  if (scope === 'mail' || scope === 'all') items = items.concat(listMail());
  if (scope === 'notification' || scope === 'all') items = items.concat(listNotification());
  items.sort((a, b) => a.localeCompare(b));
  return items;
};

const renderByScope = (name: string, scope: string): ReturnType<typeof renderMail> => {
  if (scope === 'mail') return renderMail(name);
  if (scope === 'notification') return renderNotification(name);

  try {
    return renderMail(name);
  } catch {
    try {
      return renderNotification(name);
    } catch (error_) {
      throw ErrorFactory.createTryCatchError('Template render failed', error_);
    }
  }
};

export const TemplatesCommand = BaseCommand.create({
  name: 'templates',
  description: 'Manage and render markdown templates (mail & notification)',
  addOptions: (command) => {
    command.argument('<action>', 'Action: list|render');
    command.argument('[scope]', 'Scope: mail|notification|all', 'all');
    command.argument('[name]', 'Template name when action=render');
  },
  execute: (options) => {
    const action = options.args?.[0] as string;
    const scope = (options.args?.[1] as string) ?? 'all';
    const name = options.args?.[2];

    const handleList = (sc: string): void => {
      const items = listForScope(sc);
      items.forEach((it) => ErrorHandler.info(it));
    };

    const handleRender = (nm: string | undefined, sc: string): void => {
      if (nm === null || nm === undefined || nm === '')
        throw ErrorFactory.createValidationError('Template name required');
      const out = renderByScope(nm, sc);
      ErrorHandler.info(out.html);
    };

    if (action === 'list') {
      handleList(scope);
      return;
    }

    if (action === 'render') {
      handleRender(name, scope);
      return;
    }

    throw ErrorFactory.createValidationError(`Unknown action: ${String(action)}`);
  },
});

export default TemplatesCommand;
