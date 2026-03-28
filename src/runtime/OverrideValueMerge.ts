import { isObject } from '@helper/index';

export const mergeOverrideValues = (base: unknown, override: unknown): unknown => {
  if (!isObject(base) || !isObject(override)) {
    return override;
  }

  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    merged[key] =
      isObject(current) && isObject(value) ? mergeOverrideValues(current, value) : value;
  }

  return merged;
};

export default mergeOverrideValues;
