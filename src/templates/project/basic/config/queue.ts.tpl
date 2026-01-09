/**
 * Queue Configuration (template)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override values by editing `connections` and `queueConfigObj`.
 */

import { queueConfig as coreQueueConfig } from '@zintrust/core';

type QueueConfigShape = typeof coreQueueConfig;

export const connections = {
  ...coreQueueConfig.connections,
} satisfies QueueConfigShape['connections'];

export const queueConfigObj = {
  ...coreQueueConfig,
  connections,
} satisfies QueueConfigShape;

const queueConfig = queueConfigObj;
export default queueConfig;
