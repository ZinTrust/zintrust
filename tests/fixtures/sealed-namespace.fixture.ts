/**
 * Test Utilities for Sealed Namespace Pattern
 *
 * This module provides helper utilities for testing sealed namespace objects
 * that follow the Pattern 2 refactoring standard.
 *
 * @see docs/FRAMEWORK_REFACTOR_FUNCTION_PATTERN.md
 */

import { expect, vi } from 'vitest';

/**
 * Create a sealed namespace mock for testing
 *
 * Useful for creating mock sealed namespaces with spyable methods
 *
 * @example
 * ```typescript
 * const MockRouter = createSealedNamespaceMock({
 *   createRouter: vi.fn(() => ({ routes: [] })),
 *   get: vi.fn(),
 *   post: vi.fn(),
 * });
 * ```
 */
export const createSealedNamespaceMock = <T extends Record<string, any>>(
  methods: T
): Readonly<T> => {
  return Object.freeze(methods);
};

/**
 * Spy on all methods of a sealed namespace
 *
 * @example
 * ```typescript
 * const spies = spyOnNamespace(Router, ['createRouter', 'get', 'post']);
 * // Later: spies.forEach(spy => spy.mockRestore());
 * ```
 */
export const spyOnNamespace = <T extends Record<string, any>>(
  namespace: Readonly<T>,
  methodNames: (keyof T)[]
): ReturnType<typeof vi.spyOn>[] => {
  return methodNames.map((methodName) => {
    return vi.spyOn(namespace, methodName as any);
  });
};

/**
 * Restore all spies on a sealed namespace
 *
 * @example
 * ```typescript
 * const spies = spyOnNamespace(Router, ['get', 'post']);
 * // ... test ...
 * restoreNamespaceSpies(spies);
 * ```
 */
export const restoreNamespaceSpies = (spies: ReturnType<typeof vi.spyOn>[]): void => {
  spies.forEach((spy) => spy.mockRestore());
};

/**
 * Assert that a sealed namespace is properly frozen
 *
 * @example
 * ```typescript
 * assertNamespaceIsFrozen(Router);
 * expect(() => {
 *   (Router as any).newMethod = () => {};
 * }).toThrow();
 * ```
 */
export const assertNamespaceIsFrozen = (namespace: any): void => {
  expect(Object.isFrozen(namespace)).toBe(true);
};

/**
 * Assert that a namespace method can be spied on
 *
 * @example
 * ```typescript
 * assertNamespaceMethodIsSpyable(Router, 'get');
 * ```
 */
export const assertNamespaceMethodIsSpyable = (
  namespace: Record<string, any>,
  methodName: string
): void => {
  const spy = vi.spyOn(namespace, methodName);
  expect(spy).toBeDefined();
  spy.mockRestore();
};

/**
 * Create a test factory for sealed namespace state
 *
 * @example
 * ```typescript
 * const createTestRouter = createStateFactory(() => ({
 *   routes: [],
 *   nameMap: new Map(),
 * }));
 * const router1 = createTestRouter();
 * const router2 = createTestRouter();
 * ```
 */
export const createStateFactory = <T>(factory: () => T): (() => T) => {
  return factory;
};

/**
 * Assert that state is not exposed via namespace
 *
 * @example
 * ```typescript
 * const cacheInstance = Cache.createCacheManager();
 * assertStateNotExposed(Cache, 'cache'); // Should not find cache property
 * ```
 */
export const assertStateNotExposed = (namespace: Record<string, any>, stateName: string): void => {
  const hasStateProperty = stateName in namespace;
  expect(hasStateProperty).toBe(false);
};
