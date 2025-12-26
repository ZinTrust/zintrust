import { BUILT_IN_TEMPLATES, TemplateEngine, TemplateFile } from '@cli/scaffolding/TemplateEngine';
import { describe, expect, it } from 'vitest';

describe('TemplateEngine Rendering Basic', () => {
  describe('render Basic', () => {
    it('should replace simple variables', () => {
      const content = 'Hello {{name}}, welcome to {{project}}!';
      const variables = { name: 'John', project: 'Zintrust' };
      const result = TemplateEngine.render(content, variables);

      expect(result).toBe('Hello John, welcome to Zintrust!');
    });

    it('should handle multiple occurrences of same variable', () => {
      const content = 'Use {{lang}} and {{lang}} everywhere';
      const variables = { lang: 'TypeScript' };
      const result = TemplateEngine.render(content, variables);

      expect(result).toBe('Use TypeScript and TypeScript everywhere');
    });

    it('should handle variables with spaces', () => {
      const content = 'Project: {{ projectName }}';
      const variables = { projectName: 'My App' };
      const result = TemplateEngine.render(content, variables);

      expect(result).toBe('Project: My App');
    });

    it('should convert numbers to strings', () => {
      const content = 'Port: {{port}}';
      const variables = { port: 3000 };
      const result = TemplateEngine.render(content, variables);

      expect(result).toBe('Port: 3000');
    });

    it('should convert booleans to strings', () => {
      const content = 'Enabled: {{enabled}}';
      const variables = { enabled: true };
      const result = TemplateEngine.render(content, variables);

      expect(result).toBe('Enabled: true');
    });
  });
});

describe('TemplateEngine Rendering Edge Cases', () => {
  describe('render Edge Cases', () => {
    it('should skip undefined variables', () => {
      const content = 'Name: {{name}}, Age: {{age}}';
      const variables = { name: 'John', age: undefined };
      const result = TemplateEngine.render(content, variables);

      expect(result).toBe('Name: John, Age: {{age}}');
    });

    it('should skip null variables', () => {
      const content = 'Value: {{value}}';
      const variables = { value: undefined };
      const result = TemplateEngine.render(content, variables);

      expect(result).toBe('Value: {{value}}');
    });

    it('should handle empty content', () => {
      const result = TemplateEngine.render('', { name: 'John' });
      expect(result).toBe('');
    });

    it('should handle no variables', () => {
      const content = 'Just plain text';
      const result = TemplateEngine.render(content, {});
      expect(result).toBe('Just plain text');
    });

    it('should be case-sensitive', () => {
      const content = 'Name: {{Name}}, name: {{name}}';
      const variables = { name: 'john', Name: 'John' };
      const result = TemplateEngine.render(content, variables);

      expect(result).toBe('Name: John, name: john');
    });
  });
});

describe('TemplateEngine Rendering Paths and Content', () => {
  describe('renderPath', () => {
    it('should render file paths with variables', () => {
      const path = 'app/Models/{{ModelName}}.ts';
      const variables = { ModelName: 'User' };
      const result = TemplateEngine.renderPath(path, variables);

      expect(result).toBe('app/Models/User.ts');
    });

    it('should handle multiple variables in path', () => {
      const path = '{{domain}}/{{service}}/routes.ts';
      const variables = { domain: 'ecommerce', service: 'users' };
      const result = TemplateEngine.renderPath(path, variables);

      expect(result).toBe('ecommerce/users/routes.ts');
    });
  });

  describe('renderContent', () => {
    it('should render content with variables', () => {
      const content = 'export const {{Name}} = Object.freeze({});';
      const variables = { Name: 'User' };
      const result = TemplateEngine.renderContent(content, variables);

      expect(result).toBe('export const User = Object.freeze({});');
    });

    it('should handle multi-line content', () => {
      const content = `export const {{Name}} = Object.freeze({
  getName: () => '{{Name}}',
});`;
      const variables = { Name: 'User' };
      const result = TemplateEngine.renderContent(content, variables);

      expect(result).toContain('export const User = Object.freeze({');
      expect(result).toContain("getName: () => 'User'");
    });
  });
});

describe('TemplateEngine Variable Merging', () => {
  describe('mergeVariables', () => {
    it('should merge custom variables with defaults', () => {
      const defaults = { port: 3000, host: 'localhost', database: 'sqlite' };
      const custom = { port: 3001, host: '0.0.0.0' };
      const result = TemplateEngine.mergeVariables(custom, defaults);

      expect(result).toEqual({
        port: 3001,
        host: '0.0.0.0',
        database: 'sqlite',
      });
    });

    it('should override all defaults with custom', () => {
      const defaults = { a: 1, b: 2, c: 3 };
      const custom = { a: 10, b: 20, c: 30 };
      const result = TemplateEngine.mergeVariables(custom, defaults);

      expect(result).toEqual({ a: 10, b: 20, c: 30 });
    });

    it('should add new variables from custom', () => {
      const defaults = { a: 1 };
      const custom = { b: 2, c: 3 };
      const result = TemplateEngine.mergeVariables(custom, defaults);
      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });
  });
});

describe('TemplateEngine Variable Detection', () => {
  describe('hasVariables', () => {
    it('should detect variables in content', () => {
      expect(TemplateEngine.hasVariables('Hello {{name}}')).toBe(true);
      expect(TemplateEngine.hasVariables('Hello world')).toBe(false);
    });

    it('should detect multiple variables', () => {
      expect(TemplateEngine.hasVariables('{{a}} and {{b}}')).toBe(true);
    });

    it('should handle edge cases', () => {
      expect(TemplateEngine.hasVariables('{{')).toBe(false);
      expect(TemplateEngine.hasVariables('}}')).toBe(false);
      expect(TemplateEngine.hasVariables('{{}')).toBe(false);
    });
  });
});

describe('TemplateEngine Variable Extraction', () => {
  describe('extractVariables', () => {
    it('should extract variable names', () => {
      const content = 'Hello {{name}}, welcome to {{project}}!';
      const variables = TemplateEngine.extractVariables(content);

      expect(variables).toContain('name');
      expect(variables).toContain('project');
      expect(variables.length).toBe(2);
    });

    it('should handle multiple occurrences of same variable', () => {
      const content = '{{name}} and {{name}}';
      const variables = TemplateEngine.extractVariables(content);

      expect(variables).toEqual(['name']);
    });

    it('should trim variable names', () => {
      const content = '{{ name }}  and {{  project  }}';
      const variables = TemplateEngine.extractVariables(content);

      expect(variables).toContain('name');
      expect(variables).toContain('project');
    });

    it('should return empty array for no variables', () => {
      const variables = TemplateEngine.extractVariables('Plain text');
      expect(variables).toEqual([]);
    });
  });
});

describe('TemplateEngine Built-in Templates', () => {
  describe('BUILT_IN_TEMPLATES', () => {
    it('should have basic template', () => {
      expect(BUILT_IN_TEMPLATES['basic']).toBeDefined();
      expect(BUILT_IN_TEMPLATES['basic'].name).toBe('basic');
      expect(BUILT_IN_TEMPLATES['basic'].directories).toBeDefined();
      expect(BUILT_IN_TEMPLATES['basic'].files).toBeDefined();
    });

    it('should have api template', () => {
      expect(BUILT_IN_TEMPLATES['api']).toBeDefined();
      expect(BUILT_IN_TEMPLATES['api'].name).toBe('api');
    });

    it('basic template should have required directories', () => {
      const dirs = BUILT_IN_TEMPLATES['basic'].directories;
      expect(dirs).toContain('src');
      expect(dirs).toContain('app/Models');
      expect(dirs).toContain('routes');
      expect(dirs).toContain('tests/unit');
    });

    it('basic template should have required files', () => {
      const files = BUILT_IN_TEMPLATES['basic'].files;
      const fileNames: string[] = [];
      for (const file of files) {
        fileNames.push((file as TemplateFile).path);
      }

      expect(fileNames).toContain('package.json');
      expect(fileNames).toContain('.env.example');
      expect(fileNames).toContain('README.md');
    });

    it('template files should be valid', () => {
      for (const template of Object.values(BUILT_IN_TEMPLATES)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((template as any).name).toBeDefined();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((template as any).description).toBeDefined();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(Array.isArray((template as any).directories)).toBe(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(Array.isArray((template as any).files)).toBe(true);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const file of (template as any).files) {
          expect(file.path).toBeDefined();
          expect(file.source).toBeDefined();
          expect(typeof file.path).toBe('string');
          expect(typeof file.source).toBe('string');
        }
      }
    });
  });
});
