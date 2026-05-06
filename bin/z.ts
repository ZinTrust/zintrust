#!/usr/bin/env -S node --import tsx

/**
 * ZinTrust CLI Shortcut - 'z'
 * Mirrors bin/zintrust.ts for convenience
 */

import { runCliWrapper } from './launcher';

await runCliWrapper();
