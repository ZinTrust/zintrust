/**
 * ModelGenerator Tests
 * Tests for ORM model generation
 */

import {
  ModelGenerator,
  type ModelField,
  type ModelOptions,
} from '@cli/scaffolding/ModelGenerator';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('ModelGenerator Validation', () => {
  const testModelsDir = path.join(process.cwd(), 'tests', 'tmp', 'models');

  beforeEach(async () => {
    // Create directory before each test
    try {
      await fs.mkdir(testModelsDir, { recursive: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await fs.rm(testModelsDir, { recursive: true, force: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  it('should validate correct model options', () => {
    const options: ModelOptions = {
      name: 'User',
      modelPath: testModelsDir,
    };

    const result = ModelGenerator.validateOptions(options);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject invalid model names', () => {
    const options: ModelOptions = {
      name: 'user', // Must start with uppercase
      modelPath: testModelsDir,
    };

    const result = ModelGenerator.validateOptions(options);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/start with uppercase/);
  });

  it('should reject non-existent model path', () => {
    const options: ModelOptions = {
      name: 'User',
      modelPath: '/nonexistent/path',
    };

    const result = ModelGenerator.validateOptions(options);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/does not exist/);
  });

  it('should reject invalid fields', () => {
    const options: ModelOptions = {
      name: 'User',
      modelPath: testModelsDir,
      fields: [{ name: '', type: '' }],
    };

    const result = ModelGenerator.validateOptions(options);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/must have name and type/);
  });
});

describe('ModelGenerator Basic Generation Basic', () => {
  const testModelsDir = path.join(process.cwd(), 'tests', 'tmp', 'models');

  beforeEach(async () => {
    try {
      await fs.mkdir(testModelsDir, { recursive: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  afterEach(async () => {
    try {
      await fs.rm(testModelsDir, { recursive: true, force: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  it('should generate basic model', async () => {
    const options: ModelOptions = {
      name: 'User',
      modelPath: testModelsDir,
      table: 'users',
      fillable: ['name', 'email'],
      hidden: ['password'],
    };

    const result = await ModelGenerator.generateModel(options);

    expect(result.success).toBe(true);
    expect(result.modelName).toBe('User');
    expect(result.modelFile).toContain('User.ts');
  });

  it('should generate model with fields', async () => {
    const fields: ModelField[] = [
      { name: 'id', type: 'string', unique: true },
      { name: 'name', type: 'string' },
      { name: 'email', type: 'string', unique: true },
    ];

    const options: ModelOptions = {
      name: 'User',
      modelPath: testModelsDir,
      fields,
      fillable: ['name', 'email'],
    };

    const result = await ModelGenerator.generateModel(options);

    expect(result.success).toBe(true);

    // Read generated file
    const modelFile = path.join(testModelsDir, 'User.ts');
    const content = await fs.readFile(modelFile, 'utf-8');

    expect(content).toContain('class User extends Model');
    expect(content).toContain("protected table = 'users'");
    expect(content).toContain("protected fillable = ['name', 'email']");
  });
});

describe('ModelGenerator Basic Generation Timestamps', () => {
  const testModelsDir = path.join(process.cwd(), 'tests', 'tmp', 'models');

  beforeEach(async () => {
    try {
      await fs.mkdir(testModelsDir, { recursive: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  afterEach(async () => {
    try {
      await fs.rm(testModelsDir, { recursive: true, force: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  it('should generate model with timestamps', async () => {
    const options: ModelOptions = {
      name: 'User',
      modelPath: testModelsDir,
      table: 'users',
      timestamps: true,
    };

    const result = await ModelGenerator.generateModel(options);

    expect(result.success).toBe(true);

    const modelFile = path.join(testModelsDir, 'User.ts');
    const content = await fs.readFile(modelFile, 'utf-8');

    expect(content).toContain('protected timestamps = true');
  });

  it('should generate model without timestamps', async () => {
    const options: ModelOptions = {
      name: 'Config',
      modelPath: testModelsDir,
      timestamps: false,
    };

    const result = await ModelGenerator.generateModel(options);

    expect(result.success).toBe(true);

    const modelFile = path.join(testModelsDir, 'Config.ts');
    const content = await fs.readFile(modelFile, 'utf-8');

    expect(content).toContain('protected timestamps = false');
  });
});

describe('ModelGenerator Advanced Generation', () => {
  const testModelsDir = path.join(process.cwd(), 'tests', 'tmp', 'models');

  beforeEach(async () => {
    try {
      await fs.mkdir(testModelsDir, { recursive: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  afterEach(async () => {
    try {
      await fs.rm(testModelsDir, { recursive: true, force: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  it('should generate model with relationships', async () => {
    const options: ModelOptions = {
      name: 'Post',
      modelPath: testModelsDir,
      table: 'posts',
      fillable: ['title', 'content', 'user_id'],
      relationships: [
        {
          type: 'belongsTo',
          model: 'User',
          foreignKey: 'user_id',
        },
      ],
    };

    const result = await ModelGenerator.generateModel(options);

    expect(result.success).toBe(true);

    const modelFile = path.join(testModelsDir, 'Post.ts');
    const content = await fs.readFile(modelFile, 'utf-8');

    expect(content).toContain('belongsTo');
    expect(content).toContain('user_id');
  });

  it('should generate model with soft delete', async () => {
    const options: ModelOptions = {
      name: 'Article',
      modelPath: testModelsDir,
      table: 'articles',
      softDelete: true,
    };

    const result = await ModelGenerator.generateModel(options);

    expect(result.success).toBe(true);

    const modelFile = path.join(testModelsDir, 'Article.ts');
    const content = await fs.readFile(modelFile, 'utf-8');

    expect(content).toContain('softDelete');
    expect(content).toContain('active()');
    expect(content).toContain('onlyTrashed()');
  });
});

describe('ModelGenerator Field Casts', () => {
  const testModelsDir = path.join(process.cwd(), 'tests', 'tmp', 'models');

  beforeEach(async () => {
    try {
      await fs.mkdir(testModelsDir, { recursive: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  afterEach(async () => {
    try {
      await fs.rm(testModelsDir, { recursive: true, force: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  it('should generate model with field casts', async () => {
    const fields: ModelField[] = [
      { name: 'id', type: 'string' },
      { name: 'is_active', type: 'boolean' },
      { name: 'metadata', type: 'json' },
      { name: 'created_at', type: 'datetime' },
    ];

    const options: ModelOptions = {
      name: 'Record',
      modelPath: testModelsDir,
      fields,
    };

    const result = await ModelGenerator.generateModel(options);

    expect(result.success).toBe(true);

    const modelFile = path.join(testModelsDir, 'Record.ts');
    const content = await fs.readFile(modelFile, 'utf-8');

    expect(content).toContain("is_active: 'boolean'");
    expect(content).toContain("metadata: 'json'");
    expect(content).toContain("created_at: 'datetime'");
  });
});

describe('ModelGenerator Metadata', () => {
  it('should get common field types', () => {
    const types = ModelGenerator.getCommonFieldTypes();
    expect(types).toContain('string');
    expect(types).toContain('integer');
    expect(types).toContain('boolean');
    expect(types).toContain('json');
  });

  it('should generate User model fields', () => {
    const fields = ModelGenerator.getUserFields();
    expect(fields).toHaveLength(8);
    expect(fields[0].name).toBe('id');
    expect(fields[1].name).toBe('name');
    expect(fields[2].name).toBe('email');
  });

  it('should generate Post model fields', () => {
    const fields = ModelGenerator.getPostFields();
    expect(fields).toHaveLength(7);
    expect(fields[0].name).toBe('id');
    expect(fields[1].name).toBe('user_id');
    expect(fields[2].name).toBe('title');
  });

  it('should generate Order model fields', () => {
    const fields = ModelGenerator.getOrderFields();
    expect(fields).toHaveLength(7);
    expect(fields[0].name).toBe('id');
    expect(fields[1].name).toBe('user_id');
    expect(fields[2].name).toBe('total');
  });
});

describe('ModelGenerator Edge Cases', () => {
  const testModelsDir = path.join(process.cwd(), 'tests', 'tmp', 'models');

  beforeEach(async () => {
    try {
      await fs.mkdir(testModelsDir, { recursive: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  afterEach(async () => {
    try {
      await fs.rm(testModelsDir, { recursive: true, force: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  it('should handle multiple relationships', async () => {
    const options: ModelOptions = {
      name: 'BlogPost',
      modelPath: testModelsDir,
      table: 'blog_posts',
      relationships: [
        { type: 'belongsTo', model: 'User', foreignKey: 'author_id' },
        { type: 'hasMany', model: 'Comment', foreignKey: 'post_id' },
      ],
    };

    const result = await ModelGenerator.generateModel(options);

    expect(result.success).toBe(true);

    const modelFile = path.join(testModelsDir, 'BlogPost.ts');
    const content = await fs.readFile(modelFile, 'utf-8');

    expect(content).toContain('belongsTo');
    expect(content).toContain('hasMany');
  });

  it('should auto-generate table name from model name', async () => {
    const options: ModelOptions = {
      name: 'BlogPost',
      modelPath: testModelsDir,
      // table not provided, should auto-generate
    };

    const result = await ModelGenerator.generateModel(options);

    expect(result.success).toBe(true);

    const modelFile = path.join(testModelsDir, 'BlogPost.ts');
    const content = await fs.readFile(modelFile, 'utf-8');

    // Should generate 'blog_posts' from BlogPost
    expect(content).toContain("protected table = 'blog_posts'");
  });
});
