import { Env, isUndefinedOrNull } from '@zintrust/core';
import { registerTraceIngestGateway } from '@zintrust/trace';
import { registerTraceDashboard } from '@zintrust/trace/ui';

const getTraceBasePath = () => {
  const configured = Env.get('TRACE_BASE_PATH', '/trace').trim();
  return isUndefinedOrNull(configured) ? '/trace' : configured;
};

const getTraceConnectionName = () => {
  const configured = Env.get('TRACE_DB_CONNECTION', 'sqlite').trim();
  return isUndefinedOrNull(configured) ? undefined : configured;
};

export function registerRoutes(router) {
  registerTraceDashboard(router, {
    basePath: getTraceBasePath(),
    connectionName: getTraceConnectionName(),
  });

  registerTraceIngestGateway(router, {
    basePath: Env.get('TRACE_PROXY_PATH', '/zin/trace/write'),
    connectionName: getTraceConnectionName(),
  });
}
