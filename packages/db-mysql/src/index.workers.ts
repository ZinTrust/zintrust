import { ErrorFactory } from '@zintrust/core/errors';

// Workers stub: fail loudly only if actually constructed.
// Imports none of the Node runtime (no mysql2), so esbuild/wrangler tree-shakes
// the whole MySQL driver out of the `workerd`/`worker` bundle.
export const MySQLAdapter = Object.freeze({
  create: (_config: unknown): never => {
    throw ErrorFactory.createConfigError(
      '[@zintrust/db-mysql] MySQL is not supported on the Cloudflare Workers runtime. Use DB_CONNECTION=d1.'
    );
  },
});

export default MySQLAdapter;
