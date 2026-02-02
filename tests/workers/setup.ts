import { Miniflare, type MiniflareOptions } from 'miniflare';

export type WorkersTestHarness = {
  runtime: Miniflare;
  dispose: () => Promise<void>;
};

export const createWorkersHarness = async (
  options: MiniflareOptions = {}
): Promise<WorkersTestHarness> => {
  const runtime = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } };',
    ...options,
  });

  return {
    runtime,
    dispose: async () => {
      await runtime.dispose();
    },
  };
};
