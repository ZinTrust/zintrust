import { Model } from '@orm/Model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock QueryBuilder
vi.mock('@orm/QueryBuilder', () => {
  return {
    QueryBuilder: {
      create: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        first: vi.fn(),
        get: vi.fn(),
        getParameters: vi.fn().mockReturnValue([]),
        toSQL: vi.fn().mockReturnValue('SELECT * FROM table'),
      })
    }
  };
});

const TestModel = Model.define({
  table: 'test_models',
  fillable: ['name', 'email'],
  hidden: ['password'],
  timestamps: true,
  casts: {
    id: 'number',
  },
});

describe('Model Basic Tests', () => {
  let user: any;

  beforeEach(() => {
    vi.clearAllMocks();
    user = TestModel.create({
      id: 1,
      name: 'John Doe',
      email: 'john@example.com',
    });
  });

  it('should fill attributes', () => {
    expect(user.getAttribute('name')).toBe('John Doe');
    expect(user.getAttribute('email')).toBe('john@example.com');
  });

  it('should set and get attributes', () => {
    user.setAttribute('name', 'Jane Doe');
    expect(user.getAttribute('name')).toBe('Jane Doe');
  });

  it('should return all attributes', () => {
    const attrs = user.getAttributes();
    expect(attrs.name).toBe('John Doe');
    expect(attrs.email).toBe('john@example.com');
  });

  it('should check if attribute is dirty', () => {
    expect(user.isDirty('name')).toBe(false);
    user.setAttribute('name', 'Jane Doe');
    expect(user.isDirty('name')).toBe(true);
  });

  it('should return table name', () => {
    expect(user.getTable()).toBe('test_models');
  });

  it('should convert to JSON', () => {
    const json = user.toJSON();
    expect(json.name).toBe('John Doe');
    expect(json.email).toBe('john@example.com');
    expect(json.password).toBeUndefined();
  });
});
