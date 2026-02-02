import { ZintrustLang } from '@lang/lang';

export const isNodeRuntime = (): boolean => {
  // Avoid importing any `node:*` modules so this file remains Worker-safe.
  // In Workers/Deno, `process` is typically undefined.

  return (
    typeof process !== ZintrustLang.UNDEFINED &&
    typeof process === ZintrustLang.OBJECT &&
    process !== null &&
    typeof (process as unknown as { versions?: unknown }).versions === ZintrustLang.OBJECT
  );
};
