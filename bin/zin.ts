#!/usr/bin/env -S node --import tsx

/**
 * ZinTrust CLI Shortcut - 'zin'
 * Mirrors bin/zintrust.ts for convenience
 */

import { runCliWrapper } from './launcher';

await runCliWrapper({ traceName: 'cli-wrapper' });
