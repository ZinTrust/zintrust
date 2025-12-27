import { describe, expect, it } from 'vitest';
import { TemplateRegistry } from '@/templates/TemplateRegistry';

describe('TemplateRegistry', () => {
  it('returns mappings and counts', () => {
    const mappings = TemplateRegistry.getMappings();
    expect(Array.isArray(mappings)).toBe(true);
    expect(TemplateRegistry.count()).toBe(mappings.length);
  });

  it('can get mapping by base path and check registration', () => {
    const base = 'src/orm/adapters/SQLiteAdapter.ts';
    const mapping = TemplateRegistry.getMapping(base);
    expect(mapping).toBeDefined();
    expect(mapping?.templatePath).toContain('src/templates/adapters/SQLiteAdapter.ts.tpl');
    expect(TemplateRegistry.isRegistered(base)).toBe(true);
    expect(TemplateRegistry.isRegistered('non/existent.ts')).toBe(false);
  });

  it('returns base and template paths', () => {
    const bases = TemplateRegistry.getBasePaths();
    const templates = TemplateRegistry.getTemplatePaths();
    expect(bases.length).toBeGreaterThan(0);
    expect(templates.length).toBeGreaterThan(0);
  });
});
