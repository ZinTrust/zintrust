/* eslint-disable @typescript-eslint/require-await */
export type ScheduleRunState = Readonly<{
  lastRunAt?: number;
  lastSuccessAt?: number;
  lastErrorAt?: number;
  lastErrorMessage?: string;
  nextRunAt?: number;
  consecutiveFailures?: number;
}>;

export type ScheduleRunStatePatch = Partial<ScheduleRunState>;

export type IScheduleStateStore = Readonly<{
  get: (name: string) => Promise<ScheduleRunState | null>;
  set: (name: string, patch: ScheduleRunStatePatch) => Promise<void>;
  list: () => Promise<Array<{ name: string; state: ScheduleRunState }>>;
}>;

const normalizeName = (name: string): string => String(name ?? '').trim();

export const InMemoryScheduleStateStore = Object.freeze({
  create(): IScheduleStateStore {
    const states = new Map<string, ScheduleRunState>();

    return Object.freeze({
      async get(name: string): Promise<ScheduleRunState | null> {
        const key = normalizeName(name);
        if (key.length === 0) return null;
        return states.get(key) ?? null;
      },

      async set(name: string, patch: ScheduleRunStatePatch): Promise<void> {
        const key = normalizeName(name);
        if (key.length === 0) return;

        const current = states.get(key) ?? {};
        states.set(key, { ...current, ...patch });
      },

      async list(): Promise<Array<{ name: string; state: ScheduleRunState }>> {
        return Array.from(states.entries()).map(([name, state]) => ({ name, state }));
      },
    });
  },
});

export default {
  InMemoryScheduleStateStore,
};
