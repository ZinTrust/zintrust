import { ServiceContainer } from '@/container/ServiceContainer';
import { beforeEach, describe, expect, it } from 'vitest';

describe('ServiceContainer', () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = new ServiceContainer();
  });

  it('should bind and resolve a service', () => {
    container.bind('test', () => ({ value: 1 }));
    const instance1 = container.resolve<{ value: number }>('test');
    const instance2 = container.resolve<{ value: number }>('test');

    expect(instance1).toEqual({ value: 1 });
    expect(instance2).toEqual({ value: 1 });
    expect(instance1).not.toBe(instance2); // Should be different instances
  });

  it('should register and resolve a singleton via factory', () => {
    let count = 0;
    container.singleton('test', () => {
      count++;
      return { value: count };
    });

    const instance1 = container.resolve<{ value: number }>('test');
    const instance2 = container.resolve<{ value: number }>('test');

    expect(instance1).toEqual({ value: 1 });
    expect(instance2).toEqual({ value: 1 });
    expect(instance1).toBe(instance2); // Should be same instance
    expect(count).toBe(1); // Factory should be called once
  });

  it('should register and resolve a singleton via instance', () => {
    const instance = { value: 1 };
    container.singleton('test', instance);

    const resolved = container.resolve('test');
    expect(resolved).toBe(instance);
  });

  it('should check if service exists', () => {
    container.bind('test', () => ({}));
    expect(container.has('test')).toBe(true);
    expect(container.has('non-existent')).toBe(false);
  });

  it('should get service using alias', () => {
    container.bind('test', () => 'value');
    expect(container.get('test')).toBe('value');
  });

  it('should throw error when resolving unregistered service', () => {
    expect(() => container.resolve('non-existent')).toThrow(
      'Service "non-existent" is not registered in the container'
    );
  });

  it('should flush container', () => {
    container.bind('test', () => ({}));
    container.flush();
    expect(container.has('test')).toBe(false);
  });
});
