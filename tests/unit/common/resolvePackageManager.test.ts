import * as Common from '@/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('resolvePackageManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers pnpm if pnpm-lock.yaml exists', () => {
    vi.spyOn(Common.FileChecker, 'exists').mockImplementation(
      (p: string) => p === 'pnpm-lock.yaml'
    );
    expect(Common.resolvePackageManager()).toBe('pnpm');
  });

  it('prefers yarn if yarn.lock exists', () => {
    vi.spyOn(Common.FileChecker, 'exists').mockImplementation((p: string) => p === 'yarn.lock');
    expect(Common.resolvePackageManager()).toBe('yarn');
  });

  it('prefers npm if package-lock.json exists', () => {
    vi.spyOn(Common.FileChecker, 'exists').mockImplementation(
      (p: string) => p === 'package-lock.json'
    );
    expect(Common.resolvePackageManager()).toBe('npm');
  });

  it('defaults to npm when no lock files are present', () => {
    vi.spyOn(Common.FileChecker, 'exists').mockReturnValue(false);
    expect(Common.resolvePackageManager()).toBe('npm');
  });

  it('uses provided preferred list when given', () => {
    expect(Common.resolvePackageManager(['yarn', 'npm'])).toBe('yarn');
    expect(Common.resolvePackageManager(['pnpm'])).toBe('pnpm');
  });
});
