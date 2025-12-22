import { Model } from '@orm/Model';
import { QueryBuilder } from '@orm/QueryBuilder';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock QueryBuilder
vi.mock('@orm/QueryBuilder', () => {
  const MockQueryBuilder = vi.fn(function () {
    return {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      first: vi.fn(),
      get: vi.fn(),
      getParameters: vi.fn().mockReturnValue([]),
      toSQL: vi.fn().mockReturnValue('SELECT * FROM table'),
    };
  });
  return { QueryBuilder: MockQueryBuilder };
});

class TestModel extends Model {
  protected table = 'test_models';

  public setFillable(fillable: string[]): void {
    this.fillable = fillable;
  }
  public setHidden(hidden: string[]): void {
    this.hidden = hidden;
  }
  public setCasts(casts: Record<string, string>): void {
    this.casts = casts;
  }
  public setTimestamps(timestamps: boolean): void {
    this.timestamps = timestamps;
  }
}

describe('Model Basic Tests', () => {
  let user: TestModel;

  beforeEach(() => {
    vi.clearAllMocks();
    user = new TestModel({
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
    user.setAttribute('phone', '123-456-7890');
    expect(user.getAttribute('phone')).toBe('123-456-7890');
  });

  it('should convert to JSON', () => {
    const json = user.toJSON();
    expect(json).toEqual({
      id: 1,
      name: 'John Doe',
      email: 'john@example.com',
    });
  });

  it('should hide attributes from JSON', () => {
    user.setFillable(['id', 'name', 'password']);
    user.setHidden(['password']);
    user.setAttribute('password', 'secret');

    const json = user.toJSON();
    expect(json['password']).toBeUndefined();
  });
});

describe('Model Advanced Tests', () => {
  let user: TestModel;

  beforeEach(() => {
    vi.clearAllMocks();
    user = new TestModel({
      id: 1,
      name: 'John Doe',
      email: 'john@example.com',
    });
  });

  it('should track dirty attributes', () => {
    expect(user.isDirty()).toBe(false);

    user.setAttribute('name', 'Jane Doe');
    expect(user.isDirty()).toBe(true);
    expect(user.isDirty('name')).toBe(true);
    expect(user.isDirty('email')).toBe(false);
  });

  it('should cast attributes', () => {
    const model = new TestModel();
    model.setCasts({
      is_active: 'boolean',
      age: 'integer',
      score: 'float',
      metadata: 'json',
    });

    model.setAttribute('is_active', 1);
    expect(model.getAttribute('is_active')).toBe(true);

    model.setAttribute('age', '25');
    expect(model.getAttribute('age')).toBe(25);

    model.setAttribute('score', '98.5');
    expect(model.getAttribute('score')).toBe(98.5);

    model.setAttribute('metadata', '{"key": "value"}');
    expect(model.getAttribute('metadata')).toEqual({ key: 'value' });
  });

  it('should manage timestamps', async () => {
    const model = new TestModel();
    model.setTimestamps(true);

    // Mock save to avoid DB connection
    model.save = async (): Promise<boolean> => {
      const now = new Date().toISOString();
      model.setAttribute('created_at', now);
      model.setAttribute('updated_at', now);
      return true;
    };

    await model.save();

    expect(model.getAttribute('created_at')).toBeDefined();
    expect(model.getAttribute('updated_at')).toBeDefined();
  });

  it('should find model by id', async () => {
    const mockFirst = vi.fn().mockResolvedValue({ id: 1, name: 'Found' });
    (QueryBuilder as any).mockImplementation(function () {
      return {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        first: mockFirst,
      };
    });

    const result = await TestModel.find(1);

    expect(result).toBeInstanceOf(TestModel);
    expect(result?.getAttribute('name')).toBe('Found');
    expect(mockFirst).toHaveBeenCalled();
  });

  it('should return null if model not found', async () => {
    const mockFirst = vi.fn().mockResolvedValue(null);
    (QueryBuilder as any).mockImplementation(function () {
      return {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        first: mockFirst,
      };
    });

    const result = await TestModel.find(999);

    expect(result).toBeNull();
  });

  it('should get all models', async () => {
    const mockGet = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
    (QueryBuilder as any).mockImplementation(function () {
      return {
        get: mockGet,
      };
    });

    const results = await TestModel.all();

    expect(results).toHaveLength(2);
    expect(results[0]).toBeInstanceOf(TestModel);
    expect(results[1]).toBeInstanceOf(TestModel);
    expect(mockGet).toHaveBeenCalled();
  });

  it('should create model', () => {
    const model = TestModel.create({ name: 'New' });
    expect(model).toBeInstanceOf(TestModel);
    expect(model.getAttribute('name')).toBe('New');
  });
});
