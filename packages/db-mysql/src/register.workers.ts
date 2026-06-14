type Registry = {
  register: (driver: string, factory: (cfg: unknown) => unknown) => void;
};

// Workers stub: register nothing, import nothing (no mysql2).
// The generated plugin manifest's `import '@zintrust/db-mysql/register'` line is
// safe to keep — on Workers it resolves here and becomes a no-op.
export function registerMySqlAdapter(_registry?: Registry): void {
  /* no-op on Workers */
}
