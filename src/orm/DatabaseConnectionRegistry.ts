import type { DatabaseConfig } from '@orm/DatabaseAdapter';

const state = new Map<string, DatabaseConfig>();

export const DatabaseConnectionRegistry = Object.freeze({
  clear(): void {
    state.clear();
  },

  set(name: string, config: DatabaseConfig): void {
    state.set(name, config);
  },

  get(name: string): DatabaseConfig | undefined {
    return state.get(name);
  },
});

export default DatabaseConnectionRegistry;
