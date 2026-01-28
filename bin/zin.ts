#!/usr/bin/env -S node --import tsx

/**
 * ZinTrust CLI Shortcut - 'zin'
 * Mirrors bin/zintrust.ts for convenience
 */

import { run } from './zintrust-main';

await run();
