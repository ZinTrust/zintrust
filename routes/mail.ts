import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { Mail } from '@mail/Mail';
import { Router, type IRouter } from '@zintrust/core';

export const registerMailUiPag = (router: IRouter): void => {
  const handler = async (req: IRequest, res: IResponse): Promise<void> => {
    const templateName = req.getParam('template') ?? 'welcome';
    const html = await Mail.render({
      template: templateName,
      variables:
        templateName === 'general'
          ? {
              name: 'Alice',
              headline: 'Hello Alice',
              message: 'Welcome to our platform.',
              primary_color: '#0ea5e9',
            }
          : { name: 'Alice' },
    });
    res.html(html);
  };

  Router.get(router, '/mail/:template', handler);
};
