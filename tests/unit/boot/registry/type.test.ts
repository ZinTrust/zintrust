import { describe, expect, it } from 'vitest';
import type {
  IApplication,
  RoutesModule,
  ShutdownHook,
  IShutdownManager,
} from '@/boot/registry/type';

describe('boot/registry/type', () => {
  it('should export IApplication interface', () => {
    // This test ensures the type is properly exported
    const app: IApplication = {} as IApplication;
    expect(typeof app).toBe('object');
  });

  it('should export RoutesModule type', () => {
    const module: RoutesModule = {} as RoutesModule;
    expect(typeof module).toBe('object');
  });

  it('should export ShutdownHook type', () => {
    const hook: ShutdownHook = () => {};
    expect(typeof hook).toBe('function');
  });

  it('should export IShutdownManager interface', () => {
    const manager: IShutdownManager = {} as IShutdownManager;
    expect(typeof manager).toBe('object');
  });
});
