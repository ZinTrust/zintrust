/**
 * ServiceContainer - Dependency Injection Container
 * Manages service registration and resolution with proven dependency injection patterns
 */

type ServiceFactory<T = unknown> = () => T;

interface ServiceBinding<T = unknown> {
  factory: ServiceFactory<T>;
  singleton: boolean;
  instance?: T;
}

export class ServiceContainer {
  private readonly bindings = new Map<string, ServiceBinding>();
  private readonly singletons = new Map<string, unknown>();

  /**
   * Register a service binding
   */
  public bind<T>(key: string, factory: ServiceFactory<T>): void {
    this.bindings.set(key, {
      factory: factory as ServiceFactory,
      singleton: false,
    });
  }

  /**
   * Register a singleton service (instantiated once)
   */
  public singleton<T>(key: string, factoryOrInstance: ServiceFactory<T> | T): void {
    const isFactory = typeof factoryOrInstance === 'function';

    this.bindings.set(key, {
      factory: isFactory ? (factoryOrInstance as ServiceFactory) : (): T => factoryOrInstance,
      singleton: true,
    });
  }

  /**
   * Resolve a service from the container
   */
  public resolve<T = unknown>(key: string): T {
    const binding = this.bindings.get(key);

    if (binding === undefined) {
      throw new Error(`Service "${key}" is not registered in the container`);
    }

    if (binding.singleton === true) {
      if (this.singletons.has(key) === false) {
        this.singletons.set(key, binding.factory());
      }
      return this.singletons.get(key) as T;
    }

    return binding.factory() as T;
  }

  /**
   * Check if a service is registered
   */
  public has(key: string): boolean {
    return this.bindings.has(key);
  }

  /**
   * Get a service (alias for resolve)
   */
  public get<T = unknown>(key: string): T {
    return this.resolve<T>(key);
  }

  /**
   * Clear all bindings and singletons
   */
  public flush(): void {
    this.bindings.clear();
    this.singletons.clear();
  }
}
