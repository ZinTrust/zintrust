import type { IServiceContainer } from '@container/ServiceContainer';
import { ServiceContainer } from '@container/ServiceContainer';
import { beforeEach, describe, expect, it } from 'vitest';

describe('ServiceContainer', () => {
  let container: IServiceContainer;

  beforeEach(() => {
    container = ServiceContainer.create();
  });

  it('should register and resolve a service', () => {
    const service = { name: 'test-service' };
    container.bind('test', () => service);

    const resolved = container.resolve('test');
    expect(resolved).toEqual(service);
  });

  it('should register and resolve a singleton', () => {
    const service = { counter: 0 };
    container.singleton('counter', () => service);

    const first: { counter: number } = container.resolve('counter');
    const second: { counter: number } = container.resolve('counter');

    first.counter++;
    expect(second.counter).toBe(1);
    expect(first).toBe(second);
  });

  it('should throw error if service not registered', () => {
    expect(() => container.resolve('nonexistent')).toThrow(
      'Service "nonexistent" is not registered in the container'
    );
  });

  it('should check if service exists', () => {
    container.bind('test', () => ({}));
    expect(container.has('test')).toBe(true);
    expect(container.has('nonexistent')).toBe(false);
  });

  it('should flush all bindings', () => {
    container.bind('test', () => ({}));
    container.flush();
    expect(container.has('test')).toBe(false);
  });
});
