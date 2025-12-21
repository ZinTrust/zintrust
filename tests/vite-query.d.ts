// Allows TypeScript to understand Vitest/Vite cache-busting imports used in tests.
// Example: await import('@performance/Optimizer?v=case-1')

declare module '*?*' {
  const mod: Record<string, unknown>;
  export = mod;
}
