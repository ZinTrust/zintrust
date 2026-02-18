export type MiniflareOptions = Record<string, unknown>;

export type MiniflareLike = {
  dispatchFetch: (url: string, init?: RequestInit) => Promise<Response>;
  dispose: () => Promise<void>;
};

type MiniflareCtor = new (options: Record<string, unknown>) => MiniflareLike;

const miniflareModule: { Miniflare: MiniflareCtor } | null = await import('miniflare')
  .then((m) => m as unknown as { Miniflare: MiniflareCtor })
  .catch(() => null);

export const HAS_MINIFLARE = miniflareModule !== null;

export type WorkersTestHarness = {
  runtime: MiniflareLike;
  dispose: () => Promise<void>;
};

export const createWorkersHarness = async (
  options: MiniflareOptions = {}
): Promise<WorkersTestHarness> => {
  if (!HAS_MINIFLARE || miniflareModule === null) {
    throw new Error('MINIFLARE_NOT_INSTALLED');
  }

  const runtime = new miniflareModule.Miniflare({
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
