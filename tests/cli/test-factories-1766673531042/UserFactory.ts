import { faker } from '@faker-js/faker';
import { User } from '@app/Models/User';

/**
 * UserFactory
 * Factory for generating test User instances
 */
export const UserFactory = Object.freeze({
  /**
   * Create a new factory instance
   */
  new() {
    let customData: Record<string, unknown> = {};
    const states = new Set<string>();

    const make = () => ({
      id: faker.number.int({ min: 1, max: 1000 }),
      username: faker.person.fullName(),
      is_admin: faker.datatype.boolean(),
    });

    const factory = {
      /**
       * Set custom data
       */
      data(data: Record<string, unknown>) {
        customData = { ...customData, ...data };
        return factory;
      },

      /**
       * Set attribute value
       */
      set(key: string, value: unknown) {
        customData[key] = value;
        return factory;
      },

      /**
       * Apply state
       */
      state(name: string) {
        states.add(name);
        return factory;
      },

      /**
       * Create multiple instances
       */
      count(n: number) {
        return Array.from({ length: n }, () => factory.create());
      },



      /**
       * State: Active
       */
      getActiveState() {
        return {
          active: true,
          deleted_at: null,
        };
      },

      /**
       * State: Inactive
       */
      getInactiveState() {
        return {
          active: false,
        };
      },

      /**
       * State: Deleted (soft delete)
       */
      getDeletedState() {
        return {
          deleted_at: faker.date.past().toISOString(),
        };
      },

      /**
       * Create and return merged result
       */
      create() {
        let result = { ...make(), ...customData };

        // Apply states
        if (states.has('active')) {
          result = { ...result, ...factory.getActiveState() };
        }
        if (states.has('inactive')) {
          result = { ...result, ...factory.getInactiveState() };
        }
        if (states.has('deleted')) {
          result = { ...result, ...factory.getDeletedState() };
        }

        return result;
      }
    return factory;
  }
});
