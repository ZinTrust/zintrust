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

export interface IServiceContainer {
  bind<T>(key: string, factory: ServiceFactory<T>): void;
  singleton<T>(key: string, factoryOrInstance: ServiceFactory<T> | T): void;
  resolve<T = unknown>(key: string): T;
  has(key: string): boolean;
  get<T = unknown>(key: string): T;
  flush(): void;
}

/**
 * ServiceContainer - Dependency Injection Container
 * Refactored to Functional Object pattern
 */
export const ServiceContainer = Object.freeze({
  /**
   * Create a new service container instance
   */
  create(): IServiceContainer {
    const bindings = new Map<string, ServiceBinding>();
    const singletons = new Map<string, unknown>();

    return {
      /**
       * Register a service binding
       */
      bind<T>(key: string, factory: ServiceFactory<T>): void {
        bindings.set(key, {
          factory: factory as ServiceFactory,
          singleton: false,
        });
      },

      /**
       * Register a singleton service (instantiated once)
       */
      singleton<T>(key: string, factoryOrInstance: ServiceFactory<T> | T): void {
        const isFactory = typeof factoryOrInstance === 'function';

        bindings.set(key, {
          factory: isFactory ? (factoryOrInstance as ServiceFactory) : (): T => factoryOrInstance,
          singleton: true,
        });
      },

      /**
       * Resolve a service from the container
       */
      resolve<T = unknown>(key: string): T {
        const binding = bindings.get(key);

        if (binding === undefined) {
          throw new Error(`Service "${key}" is not registered in the container`);
        }

        if (binding.singleton === true) {
          if (singletons.has(key) === false) {
            singletons.set(key, binding.factory());
          }
          return singletons.get(key) as T;
        }

        return binding.factory() as T;
      },

      /**
       * Check if a service is registered
       */
      has(key: string): boolean {
        return bindings.has(key);
      },

      /**
       * Get a service (alias for resolve)
       */
      get<T = unknown>(key: string): T {
        return this.resolve<T>(key);
      },

      /**
       * Clear all bindings and singletons
       */
      flush(): void {
        bindings.clear();
        singletons.clear();
      },
    };
  },
});

export default ServiceContainer;
