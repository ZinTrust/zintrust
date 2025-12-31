#!/usr/bin/env -S node --import tsx

/**
 * Zintrust CLI - Main Entry Point
 * Command-line interface for Zintrust framework
 * Usage: zintrust [command] [options]
 * Shortcuts: zin, z
 */

import { run } from './zintrust-main';

await run();

export {};
