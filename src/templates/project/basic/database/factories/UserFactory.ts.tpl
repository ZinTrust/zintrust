import { faker } from '@faker-js/faker';

interface UserFactoryData {
  id: number;
  name: string;
  email: string;
  password: string;
  email_verified_at: string | null;
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
  email_verified_at: faker.date.past().toISOString(),
  active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

let customData: Record<string, unknown> = {};
let customStates: Record<string, Record<string, unknown>> = {};

export const UserFactory = Object.freeze({
  data(data: Record<string, unknown>): UserFactory {
    customData = { ...data };
    return UserFactory;
  },

  set(key: string, value: unknown): UserFactory {
    customData[key] = value;
    return UserFactory;
  },

  state(name: string): UserFactory {
    customStates[name] = {};
    return UserFactory;
  },

  count(n: number): UserFactoryData[] {
    return Array.from({ length: n }, () => this.create());
  },

  getActiveState(): { active: boolean; deleted_at: null } {
    return { active: true, deleted_at: null };
  },

  getInactiveState(): { active: boolean } {
    return { active: false };
  },

  getDeletedState(): { deleted_at: string } {
    return { deleted_at: new Date().toISOString() };
  },

  create(): UserFactoryData {
    const base = makeUserData();
    return {
      ...base,
      ...customData,
      ...customStates,
    } as UserFactoryData;
  },
}) as UserFactory;
