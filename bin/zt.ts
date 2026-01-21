#!/usr/bin/env -S node --import tsx

/**
 * ZinTrust CLI Shortcut - 'z'
 * Mirrors bin/zintrust.ts for convenience
 */

import { run } from './zintrust-main.js';

await run();
