/**
 * HTTP Logger (starter override)
 *
 * Starter projects should import the framework's HttpLogger from `@zintrust/core`.
 * This keeps templates free of deep/internal imports.
 */

import { HttpLogger } from '@zintrust/core';
import type { HttpLogEvent } from '@zintrust/core';

export { HttpLogger };
export type { HttpLogEvent };

export default HttpLogger;
