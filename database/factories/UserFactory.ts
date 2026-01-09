import { faker } from '@faker-js/faker';

interface UserFactoryData {
  id: number;
  name: string;
  email: string;
  password: string;
  email_verified_at: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

interface UserFactory {
  data: (data: Record<string, unknown>) => UserFactory;
  set: (key: string, value: unknown) => UserFactory;
  state: (name: string) => UserFactory;
  count: (n: number) => UserFactoryData[];
  getActiveState: () => { active: boolean; deleted_at: null };
  getInactiveState: () => { active: boolean };
  getDeletedState: () => { deleted_at: string };
  create: () => UserFactoryData;
}

const makeUserData = (): Omit<UserFactoryData, 'deleted_at'> => ({
  id: faker.number.int({ min: 1, max: 1000 }),
  name: faker.person.fullName(),
  email: faker.internet.email(),
  password: faker.internet.password(),
  email_verified_at: faker.internet.email(),
  active: faker.datatype.boolean(),
  created_at: faker.date.recent().toISOString(),
  updated_at: faker.date.recent().toISOString(),
});

const applyStates = (
  result: Record<string, unknown>,
  states: Set<string>,
  factory: UserFactory
): Record<string, unknown> => {
  let updated = { ...result };
  if (states.has('active')) {
    updated = { ...updated, ...factory.getActiveState() };
  }
  if (states.has('inactive')) {
    updated = { ...updated, ...factory.getInactiveState() };
  }
  if (states.has('deleted')) {
    updated = { ...updated, ...factory.getDeletedState() };
  }
  return updated;
};

/**
 * UserFactory
 * Factory for generating test User instances
 */
export const UserFactory = Object.freeze({
  /**
   * Create a new factory instance
   */
  new(): UserFactory {
    let customData: Record<string, unknown> = {};
    const states = new Set<string>();

    const factory = {
      /**
       * Set custom data
       */
      data(data: Record<string, unknown>): UserFactory {
        customData = { ...customData, ...data };
        return factory;
      },

      /**
       * Set attribute value
       */
      set(key: string, value: unknown): UserFactory {
        customData[key] = value;
        return factory;
      },

      /**
       * Apply state
       */
      state(name: string): UserFactory {
        states.add(name);
        return factory;
      },

      /**
       * Create multiple instances
       */
      count(n: number): UserFactoryData[] {
        return Array.from({ length: n }, () => factory.create());
      },

      /**
       * State: Active
       */
      getActiveState(): {
        active: boolean;
        deleted_at: null;
      } {
        return {
          active: true,
          deleted_at: null,
        };
      },

      /**
       * State: Inactive
       */
      getInactiveState(): {
        active: boolean;
      } {
        return {
          active: false,
        };
      },

      /**
       * State: Deleted (soft delete)
       */
      getDeletedState(): {
        deleted_at: string;
      } {
        return {
          deleted_at: faker.date.past().toISOString(),
        };
      },

      /**
       * Create and return merged result
       */
      create(): UserFactoryData {
        const result = { ...makeUserData(), ...customData };
        return applyStates(result, states, factory) as unknown as UserFactoryData;
      },
    };

    return factory;
  },
});
