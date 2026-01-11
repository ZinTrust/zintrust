import { Application } from '@boot/Application';
import type { IKernel } from '@http/Kernel';
import { Kernel } from '@http/Kernel';

let kernelPromise: Promise<IKernel> | null = null;

export async function getKernel(): Promise<IKernel> {
  if (kernelPromise !== null) {
    return kernelPromise;
  }

  const initialize = async (): Promise<IKernel> => {
    const app = Application.create();
    await app.boot();
    return Kernel.create(app.getRouter(), app.getContainer());
  };

  kernelPromise = initialize().catch((error) => {
    // Allow retry on subsequent calls if initialization fails.
    kernelPromise = null;
    throw error;
  });

  return kernelPromise;
}

/**
 * Test-only helper.
 *
 * Allows unit tests to reset the singleton between cases without leaking state.
 */
export function __resetKernelForTests(): void {
  kernelPromise = null;
}
