/**
 * Template Registry
 * Maps base framework files to their .tpl template equivalents
 * Sealed namespace pattern for immutability
 */

export interface TemplateMapping {
  basePath: string;
  templatePath: string;
  description: string;
}

const MAPPINGS: TemplateMapping[] = [
  {
    basePath: 'src/orm/adapters/SQLiteAdapter.ts',
    templatePath: 'src/templates/adapters/SQLiteAdapter.ts.tpl',
    description: 'SQLite database adapter',
  },
  {
    basePath: 'src/orm/adapters/PostgreSQLAdapter.ts',
    templatePath: 'src/templates/adapters/PostgreSQLAdapter.ts.tpl',
    description: 'PostgreSQL database adapter',
  },
  {
    basePath: 'src/orm/adapters/MySQLAdapter.ts',
    templatePath: 'src/templates/adapters/MySQLAdapter.ts.tpl',
    description: 'MySQL database adapter',
  },
  {
    basePath: 'src/orm/adapters/SQLServerAdapter.ts',
    templatePath: 'src/templates/adapters/SQLServerAdapter.ts.tpl',
    description: 'SQL Server database adapter',
  },
  {
    basePath: 'src/features/Auth.ts',
    templatePath: 'src/templates/features/Auth.ts.tpl',
    description: 'Authentication feature with JWT & bcrypt',
  },
  {
    basePath: 'src/features/Queue.ts',
    templatePath: 'src/templates/features/Queue.ts.tpl',
    description: 'Job queue feature',
  },
];

/**
 * Sealed namespace providing template registry access
 */
export const TemplateRegistry = Object.freeze({
  /**
   * Get all template mappings
   */
  getMappings(): TemplateMapping[] {
    return [...MAPPINGS];
  },

  /**
   * Get a specific mapping by base path
   */
  getMapping(basePath: string): TemplateMapping | undefined {
    return MAPPINGS.find((m) => m.basePath === basePath);
  },

  /**
   * Get all base file paths
   */
  getBasePaths(): string[] {
    return MAPPINGS.map((m) => m.basePath);
  },

  /**
   * Get all template paths
   */
  getTemplatePaths(): string[] {
    return MAPPINGS.map((m) => m.templatePath);
  },

  /**
   * Validate if a base path is in the registry
   */
  isRegistered(basePath: string): boolean {
    return MAPPINGS.some((m) => m.basePath === basePath);
  },

  /**
   * Get count of registered templates
   */
  count(): number {
    return MAPPINGS.length;
  },
});
