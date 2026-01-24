import type { IRequest } from '@zintrust/core';

/**
 * Helper to get path parameter
 */
export const getParam = (req: IRequest, key: string): string => {
  const direct = req.getParam?.(key);
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const params = (req.params as Record<string, string> | undefined) ?? {};
  return params[key] ?? '';
};
