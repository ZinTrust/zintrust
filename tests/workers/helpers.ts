export const createWorkersCompatibility = () => {
  return {
    compatibilityDate: '2025-04-21',
    compatibilityFlags: ['nodejs_compat'],
  };
};

export const createMockService = (body: string, status = 200) => {
  return {
    fetch: async () => new Response(body, { status }),
  };
};
