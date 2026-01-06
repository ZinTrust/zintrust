import { Logger } from '@config/logger';

export type EventMap = Record<string, unknown>;
export type EventListener<TPayload> = (payload: TPayload) => void | Promise<void>;

export interface IEventDispatcher<TEvents extends EventMap = EventMap> {
  on<K extends keyof TEvents & string>(event: K, listener: EventListener<TEvents[K]>): () => void;
  once<K extends keyof TEvents & string>(event: K, listener: EventListener<TEvents[K]>): () => void;
  off<K extends keyof TEvents & string>(event: K, listener: EventListener<TEvents[K]>): void;
  emit<K extends keyof TEvents & string>(event: K, payload: TEvents[K]): void;
  emitAsync<K extends keyof TEvents & string>(event: K, payload: TEvents[K]): Promise<void>;
  listenerCount<K extends keyof TEvents & string>(event: K): number;
  clear<K extends keyof TEvents & string>(event?: K): void;
}

type AnyListener = EventListener<unknown>;

type ListenerStore = Map<string, Set<AnyListener>>;

function getOrCreateSet(store: ListenerStore, event: string): Set<AnyListener> {
  const existing = store.get(event);
  if (existing !== undefined) return existing;

  const created = new Set<AnyListener>();
  store.set(event, created);
  return created;
}

function safeFireAndForget(listener: AnyListener, payload: unknown, event: string): void {
  const result = listener(payload);
  if (result instanceof Promise) {
    void result.catch((error: unknown) => {
      Logger.error('Unhandled async event listener error', { event, error });
    });
  }
}

export const EventDispatcher = Object.freeze({
  create<TEvents extends EventMap = EventMap>(): IEventDispatcher<TEvents> {
    const listeners: ListenerStore = new Map();

    return {
      on<K extends keyof TEvents & string>(
        event: K,
        listener: EventListener<TEvents[K]>
      ): () => void {
        const set = getOrCreateSet(listeners, event);
        set.add(listener as AnyListener);

        return (): void => {
          this.off(event, listener);
        };
      },

      once<K extends keyof TEvents & string>(
        event: K,
        listener: EventListener<TEvents[K]>
      ): () => void {
        const wrapped: AnyListener = async (payload: unknown) => {
          this.off(event, wrapped as unknown as EventListener<TEvents[K]>);
          return (listener as AnyListener)(payload);
        };

        const set = getOrCreateSet(listeners, event);
        set.add(wrapped);

        return (): void => {
          this.off(event, wrapped as unknown as EventListener<TEvents[K]>);
        };
      },

      off<K extends keyof TEvents & string>(event: K, listener: EventListener<TEvents[K]>): void {
        const set = listeners.get(event);
        if (set === undefined) return;

        set.delete(listener as AnyListener);

        if (set.size === 0) {
          listeners.delete(event);
        }
      },

      emit<K extends keyof TEvents & string>(event: K, payload: TEvents[K]): void {
        const set = listeners.get(event);
        if (set === undefined) return;

        // Snapshot to avoid mutation during iteration affecting dispatch.
        const snapshot = Array.from(set);
        for (const listener of snapshot) {
          safeFireAndForget(listener, payload, event);
        }
      },

      async emitAsync<K extends keyof TEvents & string>(
        event: K,
        payload: TEvents[K]
      ): Promise<void> {
        const set = listeners.get(event);
        if (set === undefined) return;

        const snapshot = Array.from(set);

        const results = await Promise.allSettled(
          snapshot.map(async (listener) => {
            await listener(payload);
          })
        );

        const errors = results
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map((r) => r.reason as unknown);

        if (errors.length === 1) {
          throw errors[0];
        }

        if (errors.length > 1) {
          throw new AggregateError(errors, `Multiple event listeners failed for "${event}"`);
        }
      },

      listenerCount<K extends keyof TEvents & string>(event: K): number {
        return listeners.get(event)?.size ?? 0;
      },

      clear<K extends keyof TEvents & string>(event?: K): void {
        if (event !== undefined) {
          listeners.delete(event);
          return;
        }

        listeners.clear();
      },
    };
  },
});

export default EventDispatcher;
