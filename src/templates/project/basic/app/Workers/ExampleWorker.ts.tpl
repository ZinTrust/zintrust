import { Logger } from '@zintrust/core';

export const workerDefinition = Object.freeze({
  name: 'example-worker',
  queueName: 'example-worker',
  version: '1.0.0',
  autoStart: false,
  activeStatus: true,
  concurrency: 1,
  processorSpec: 'app/Workers/ExampleWorker.ts',
});

export async function ZinTrustProcessor(payload: unknown): Promise<void> {
  Logger.info('Example worker processed job', { payload });
}

export default ZinTrustProcessor;
