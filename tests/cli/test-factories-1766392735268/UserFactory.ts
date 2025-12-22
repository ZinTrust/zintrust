import { faker } from '@faker-js/faker';
import { User } from '@app/Models/User';

/**
 * UserFactory
 * Factory for generating test User instances
 */
export class UserFactory {
  private data: Record<string, unknown> = {};
  private states: Set<string> = new Set();

  /**
   * Create a new factory instance
   */
  static new(): UserFactory {
    return new UserFactory();
  }

  /**
   * Create and return instance
   */
  make(): Partial<User> {
    return {
      id: faker.number.int({ min: 1, max: 1000 }),
      name: faker.person.fullName(),
      email: faker.internet.email(),
      password: faker.internet.password(),
      email_verified_at: faker.internet.email(),
      active: faker.datatype.boolean(),
      created_at: faker.date.recent().toISOString(),
      updated_at: faker.date.recent().toISOString(),
    };
  }

  /**
   * Create multiple instances
   */
  count(n: number): Partial<User>[] {
    return Array.from({ length: n }, () => this.make());
  }

  /**
   * Set custom data
   */
  data(data: Record<string, unknown>): this {
    this.data = { ...this.data, ...data };
    return this;
  }

  /**
   * Set attribute value
   */
  set(key: string, value: unknown): this {
    this.data[key] = value;
    return this;
  }

  /**
   * Apply state
   */
  state(name: string): this {
    this.states.add(name);
    return this;
  }


  /**
   * Get final data with states applied
   */
  private getData(): Partial<User> {
    let result = this.make();

    // Apply custom data
    result = { ...result, ...this.data };

    // Apply states
    if (this.states.has('active') === true) {
      result = { ...result, ...this.getActiveState() };
    }

    if (this.states.has('inactive') === true) {
      result = { ...result, ...this.getInactiveState() };
    }

    if (this.states.has('deleted') === true) {
      result = { ...result, ...this.getDeletedState() };
    }

    return result;
  }


  /**
   * State: Active
   */
  private getActiveState(): Partial<User> {
    return {
      active: true,
      deleted_at: null,
    };
  }

  /**
   * State: Inactive
   */
  private getInactiveState(): Partial<User> {
    return {
      active: false,
    };
  }

  /**
   * State: Deleted (soft delete)
   */
  private getDeletedState(): Partial<User> {
    return {
      deleted_at: faker.date.past().toISOString(),
    };
  }



  /**
   * Create and return merged result
   */
  create(): Partial<User> {
    return this.getData();
  }

}
