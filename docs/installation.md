# Installation & Setup

## Prerequisites

- Node.js 18+
- npm (recommended)

## Installation

\`\`\`bash
npm install -g @zintrust/core
\`\`\`

## Core Package Dependencies (CLI + DX)

The published npm package `@zintrust/core` includes runtime dependencies primarily for the CLI and developer experience:

- `commander` - CLI command parsing
- `inquirer` - interactive prompts
- `chalk` - colored terminal output
- `tsx` - runs TypeScript-based CLI entrypoints

It also ships with some built-in feature/adapters dependencies:

- `better-sqlite3` - SQLite database driver
- `bcrypt` - password hashing
- `jsonwebtoken` - JWT utilities

Note: `better-sqlite3` is a native module and may require build tools on some platforms.

## First Project

\`\`\`bash
zin new my-app
cd my-app
npm run dev
\`\`\`
