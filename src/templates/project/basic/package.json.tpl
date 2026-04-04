{
  "name": "{{projectName}}",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "zin s",
    "build": "tsc && tsc-alias",
    "lint": "eslint .",
    "start": "zin s --mode production --no-watch",
    "test": "vitest run",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@zintrust/core": "^{{coreVersion}}",
    "@zintrust/d1-migrator": "^0.4.6"
  },
  "devDependencies": {
    "@zintrust/governance": "{{governanceVersion}}",
    "@types/node": "^25.0.3",
    "eslint": "^10.0.0",
    "tsx": "^4.21.0",
    "tsc-alias": "^1.8.16",
    "typescript": "^5.9.3",
    "vitest": "^4.0.16"
  }
}
