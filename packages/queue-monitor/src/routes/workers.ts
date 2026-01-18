import { Logger, Router, type IRouter } from '@zintrust/core';
import { WorkerClient } from '../api/workerClient';
import { WorkerConfig } from '../config/workerConfig';
import { getWorkersHtml, type WorkerUiOptions } from '../workers-ui';

type RouteOptions = { middleware?: ReadonlyArray<string> } | undefined;

type RequestWithParams = {
  getParam?: (name: string) => string | undefined;
  params?: Record<string, string>;
};

const getParam = (req: RequestWithParams, name: string): string | undefined => {
  if (typeof req.getParam === 'function') return req.getParam(name);
  return req.params ? req.params[name] : undefined;
};

const normalizeWorkerList = async (): Promise<
  Array<{ name: string; status: unknown; health: unknown; worker?: unknown }>
> => {
  const workers = await WorkerClient.listWorkers();

  const details = await Promise.all(
    workers.map(async (name) => {
      const [status, health, worker] = await Promise.all([
        WorkerClient.getStatus(name).catch(() => null),
        WorkerClient.getHealth(name).catch(() => null),
        WorkerClient.getWorker(name).catch(() => null),
      ]);

      return {
        name,
        status,
        health,
        worker,
      };
    })
  );

  return details;
};

const registerWorkerUiPage = (
  router: IRouter,
  options: WorkerUiOptions,
  routeOptions: RouteOptions
): void => {
  Router.get(
    router,
    `${options.basePath}/workers`,
    (_req, res) => {
      res.html(
        getWorkersHtml({
          basePath: options.basePath,
          apiBaseUrl: WorkerConfig.getWorkerBaseUrl(),
          autoRefresh: options.autoRefresh,
          refreshIntervalMs: options.refreshIntervalMs,
        })
      );
    },
    routeOptions
  );
};

const registerWorkerListRoute = (
  router: IRouter,
  options: WorkerUiOptions,
  routeOptions: RouteOptions
): void => {
  Router.get(
    router,
    `${options.basePath}/api/workers`,
    async (_req, res) => {
      try {
        const workers = await normalizeWorkerList();
        res.json({ ok: true, workers });
      } catch (error) {
        Logger.error('Worker UI list failed', error);
        res.status(500).json({ error: (error as Error).message });
      }
    },
    routeOptions
  );
};

const registerWorkerActionRoutes = (
  router: IRouter,
  options: WorkerUiOptions,
  routeOptions: RouteOptions
): void => {
  const postAction = (action: 'start' | 'stop' | 'restart'): void => {
    Router.post(
      router,
      `${options.basePath}/api/workers/:name/${action}`,
      async (req, res) => {
        const name = getParam(req as RequestWithParams, 'name');
        if (!name) {
          res.status(400).json({ error: 'Worker name required' });
          return;
        }

        try {
          if (action === 'start') {
            await WorkerClient.startWorker(name);
          } else if (action === 'stop') {
            await WorkerClient.stopWorker(name);
          } else {
            await WorkerClient.restartWorker(name);
          }
          const verb = action === 'restart' ? 'restarted' : `${action}ed`;
          res.json({ ok: true, message: `Worker ${name} ${verb}` });
        } catch (error) {
          Logger.error(`Worker UI ${action} failed`, error);
          res.status(500).json({ error: (error as Error).message });
        }
      },
      routeOptions
    );
  };

  postAction('start');
  postAction('stop');
  postAction('restart');
};

const registerWorkerHealthRoute = (
  router: IRouter,
  options: WorkerUiOptions,
  routeOptions: RouteOptions
): void => {
  Router.get(
    router,
    `${options.basePath}/api/workers/:name/health`,
    async (req, res) => {
      const name = getParam(req as RequestWithParams, 'name');
      if (!name) {
        res.status(400).json({ error: 'Worker name required' });
        return;
      }

      try {
        const health = await WorkerClient.getHealth(name);
        res.json({ ok: true, health });
      } catch (error) {
        Logger.error('Worker UI health fetch failed', error);
        res.status(500).json({ error: (error as Error).message });
      }
    },
    routeOptions
  );
};

export const registerWorkerUiRoutes = (
  router: IRouter,
  options: WorkerUiOptions,
  routeOptions: RouteOptions
): void => {
  registerWorkerUiPage(router, options, routeOptions);
  registerWorkerListRoute(router, options, routeOptions);
  registerWorkerActionRoutes(router, options, routeOptions);
  registerWorkerHealthRoute(router, options, routeOptions);
};

export default Object.freeze({ registerWorkerUiRoutes });
