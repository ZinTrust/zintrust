import { databaseConfig } from '@config/database';
import { registerDatabasesFromRuntimeConfig } from '@orm/DatabaseRuntimeRegistration';
import { SchedulerRuntime } from '@scheduler/SchedulerRuntime';
import type { ISchedule } from '@scheduler/types';

type LoadedScheduleModules = {
  core: ISchedule[];
  app: ISchedule[];
};

const isSchedule = (value: unknown): value is ISchedule => {
  if (value === undefined || value === null || typeof value !== 'object') return false;
  return 'name' in value && typeof (value as { name?: unknown }).name === 'string';
};

const loadScheduleModules = async (): Promise<LoadedScheduleModules> => {
  const coreSchedules = await import('@schedules/index');

  let appSchedules: Record<string, unknown> = {};
  try {
    appSchedules = (await import('@app/Schedules')) as unknown as Record<string, unknown>;
  } catch {
    appSchedules = {};
  }

  return {
    core: Object.values(coreSchedules).filter(isSchedule),
    app: Object.values(appSchedules).filter(isSchedule),
  };
};

const shutdownCliResources = async (): Promise<void> => {
  try {
    const mod = await import('@orm/ConnectionManager');
    await mod.ConnectionManager.shutdownIfInitialized();
  } catch {
    // best-effort
  }

  try {
    const mod = await import('@orm/Database');
    await mod.resetDatabase();
  } catch {
    // best-effort
  }

  try {
    const mod = (await import('@queue/LockProvider')) as unknown as {
      closeLockProvider?: () => Promise<void>;
    };
    await mod.closeLockProvider?.();
  } catch {
    // best-effort
  }
};

export const ScheduleCliSupport = Object.freeze({
  async registerAll(): Promise<void> {
    registerDatabasesFromRuntimeConfig(databaseConfig);

    const modules = await loadScheduleModules();
    SchedulerRuntime.registerMany(modules.core, 'core');
    SchedulerRuntime.registerMany(modules.app, 'app');
  },

  shutdownCliResources,
});

export default ScheduleCliSupport;
