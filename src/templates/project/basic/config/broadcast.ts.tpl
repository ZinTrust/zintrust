/**
 * Broadcast Configuration (template)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override values by editing `drivers` and `broadcastConfigObj`.
 */

import { broadcastConfig as coreBroadcastConfig } from '@zintrust/core';

type BroadcastConfigShape = typeof coreBroadcastConfig;

export const drivers = {
  ...coreBroadcastConfig.drivers,
} satisfies BroadcastConfigShape['drivers'];

export const broadcastConfigObj = {
  ...coreBroadcastConfig,
  drivers,
} satisfies BroadcastConfigShape;

const broadcastConfig = broadcastConfigObj;
export default broadcastConfig;
