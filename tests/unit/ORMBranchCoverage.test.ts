import { Model } from '@orm/Model';
import { describe, expect, it } from 'vitest';

describe('Model Branch Logic', () => {
  it('should handle model instantiation with attributes', () => {
    const TestModel = Model.define({
      table: 'test_models',
      fillable: ['name', 'email'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const model = TestModel.create({ name: 'test' });
    expect(model).toBeDefined();
    expect(model.getTable()).toBe('test_models');
    expect(model.getAttribute('name')).toBe('test');
  });

  it('should handle attribute assignment', () => {
    const TestModel = Model.define({
      table: 'tests',
      fillable: ['name'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const model = TestModel.create();
    model.setAttribute('name', 'test');
    expect(model.getAttribute('name')).toBe('test');
  });

  it('should check fillable property behavior', () => {
    const TestModel = Model.define({
      table: 'tests',
      fillable: ['id', 'name', 'email', 'created_at'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const model = TestModel.create();
    expect(model).toBeDefined();
  });
});
