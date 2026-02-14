export const createFetchResponse = (status: number, body: unknown): Response => {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
};

export const createFetchResponseText = (status: number, text: string): Response => {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => text,
  } as unknown as Response;
};
