import { Router, type IRouter } from '@zintrust/core';
import { WorkerConfig } from '../config/workerConfig';
import { getWorkersHtml, type WorkerUiOptions } from '../workers-ui';

type RouteOptions = { middleware?: ReadonlyArray<string> } | undefined;

const registerWorkerUiPage = (
  router: IRouter,
  options: WorkerUiOptions,
  routeOptions: RouteOptions
): void => {
  const handler = (_req: unknown, res: { html: (value: string) => void }): void => {
    res.html(
      getWorkersHtml({
        basePath: options.basePath,
        apiBaseUrl: WorkerConfig.getWorkerBaseUrl(),
        autoRefresh: options.autoRefresh,
        refreshIntervalMs: options.refreshIntervalMs,
      })
    );
  };

  Router.get(router, `${options.basePath}/workers`, handler, routeOptions);
  Router.get(router, '/workers', handler, routeOptions);
  Router.get(router, '/workers/', handler, routeOptions);
};

export const registerWorkerUiRoutes = (
  router: IRouter,
  options: WorkerUiOptions,
  routeOptions: RouteOptions
): void => {
  registerWorkerUiPage(router, options, routeOptions);
};

export default Object.freeze({ registerWorkerUiRoutes });
