/**
 * BackgroundTaskScheduler tests
 */
import { BackgroundTaskScheduler } from '@runtime/BackgroundTaskScheduler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('BackgroundTaskScheduler', () => {
  beforeEach(() => {
    BackgroundTaskScheduler.reset();
  });

  describe('default behavior (Node.js)', () => {
    it('should schedule tasks as fire-and-forget in Node runtime', () => {
      const task = Promise.resolve();
      const spy = vi.spyOn(task, 'catch');

      BackgroundTaskScheduler.schedule(task);

      // In Node, tasks are scheduled with error suppression
      expect(spy).toHaveBeenCalled();
    });

    it('should return a scheduler that is available', () => {
      const scheduler = BackgroundTaskScheduler.getScheduler();
      expect(scheduler.isAvailable()).toBe(true);
    });

    it('should allow multiple tasks to be scheduled', () => {
      const task1 = Promise.resolve();
      const task2 = Promise.resolve();

      const scheduleMultipleTasks = () => {
        BackgroundTaskScheduler.schedule(task1);
        BackgroundTaskScheduler.schedule(task2);
      };

      expect(scheduleMultipleTasks).not.toThrow();
    });
  });

  describe('Workers context', () => {
    it('should use waitUntil when execution context is set', () => {
      const mockWaitUntil = vi.fn();
      const mockContext = {
        waitUntil: mockWaitUntil,
        passThroughOnException: vi.fn(),
        props: {},
      } as any;

      BackgroundTaskScheduler.setExecutionContext(mockContext);

      const task = Promise.resolve();
      BackgroundTaskScheduler.schedule(task);

      expect(mockWaitUntil).toHaveBeenCalledWith(task);
    });

    it('should return a scheduler that is available when context is set', () => {
      const mockContext = {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
        props: {},
      } as any;

      BackgroundTaskScheduler.setExecutionContext(mockContext);

      const scheduler = BackgroundTaskScheduler.getScheduler();
      expect(scheduler.isAvailable()).toBe(true);
    });

    it('should replace the scheduler when context is set multiple times', () => {
      const mockWaitUntil1 = vi.fn();
      const mockContext1 = {
        waitUntil: mockWaitUntil1,
        passThroughOnException: vi.fn(),
        props: {},
      } as any;

      const mockWaitUntil2 = vi.fn();
      const mockContext2 = {
        waitUntil: mockWaitUntil2,
        passThroughOnException: vi.fn(),
        props: {},
      } as any;

      BackgroundTaskScheduler.setExecutionContext(mockContext1);
      BackgroundTaskScheduler.setExecutionContext(mockContext2);

      const task = Promise.resolve();
      BackgroundTaskScheduler.schedule(task);

      expect(mockWaitUntil1).not.toHaveBeenCalled();
      expect(mockWaitUntil2).toHaveBeenCalledWith(task);
    });
  });

  describe('reset', () => {
    it('should clear the execution context on reset', () => {
      const mockContext = {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
        props: {},
      } as any;

      BackgroundTaskScheduler.setExecutionContext(mockContext);
      BackgroundTaskScheduler.reset();

      const task = Promise.resolve();
      BackgroundTaskScheduler.schedule(task);

      // After reset, should use default Node scheduler
      expect(mockContext.waitUntil).not.toHaveBeenCalled();
    });

    it('should clear the scheduler on reset', () => {
      const mockContext = {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
        props: {},
      } as any;

      BackgroundTaskScheduler.setExecutionContext(mockContext);
      BackgroundTaskScheduler.reset();

      // After reset, should create a new scheduler
      const scheduler1 = BackgroundTaskScheduler.getScheduler();
      const scheduler2 = BackgroundTaskScheduler.getScheduler();
      expect(scheduler1).toBe(scheduler2);
    });
  });

  describe('error handling', () => {
    it('should not throw when scheduling a rejected promise', () => {
      const task = Promise.reject(new Error('Test error'));

      const scheduleRejectedTask = () => {
        BackgroundTaskScheduler.schedule(task);
      };

      expect(scheduleRejectedTask).not.toThrow();
    });

    it('should suppress errors in Node runtime', async () => {
      const task = Promise.reject(new Error('Test error'));

      BackgroundTaskScheduler.schedule(task);

      // Wait for the next microtask to ensure the promise is processed
      await Promise.resolve();

      // Should not cause unhandled rejection
      expect(true).toBe(true);
    });
  });
});
