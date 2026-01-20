#!/usr/bin/env -S node --import tsx

/**
 * ZinTrust CLI - Main Entry Point
 *
 * This bin script is a thin wrapper around the hashbang-free implementation in
 * bin/zintrust-main.ts. Keeping the implementation hashbang-free allows other
 * shortcuts (zin/z/zt) to import it without parse issues.
 */

import { run } from './zintrust-main.js';

await run();
export {};
