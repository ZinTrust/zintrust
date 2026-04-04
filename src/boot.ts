import { ensureNodeStartupEnvLoaded } from '@runtime/NodeStartup';

await ensureNodeStartupEnvLoaded({
  entry: '@zintrust/core/boot',
  warnOnMissingEnv: true,
});
await import('@boot/bootstrap');

export {};
