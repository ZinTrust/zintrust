/**
 * Seeder Generator - Phase 6.2
 * Generates database seeders for populating development/staging databases
 * Uses factory generators for consistent data generation
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface SeederField {
  name: string;
  type: string;
  faker?: string;
}

export interface SeederOptions {
  seederName: string;
  modelName: string;
  factoryName?: string;
  seedersPath: string;
  count?: number;
  relationships?: string[];
  truncate?: boolean;
}

export interface SeederGeneratorResult {
  success: boolean;
  filePath: string;
  message: string;
}

/**
 * Seeder Generator - Creates database seeders using factory classes
 * Enables rapid database population for development and staging
 */

/**
 * Validate seeder options
 */
export async function validateOptions(options: SeederOptions): Promise<void> {
  if (options.seederName === undefined || options.seederName.trim() === '') {
    throw new Error('Seeder name is required');
  }

  if (!options.seederName.endsWith('Seeder')) {
    throw new Error('Seeder name must end with "Seeder" (e.g., UserSeeder)');
  }

  if (!/^[A-Z][a-zA-Z0-9]*Seeder$/.test(options.seederName)) {
    throw new Error('Seeder name must be PascalCase ending with "Seeder"');
  }

  if (options.modelName === undefined || options.modelName.trim() === '') {
    throw new Error('Model name is required');
  }

  if (!/^[A-Z][a-zA-Z0-9]*$/.test(options.modelName)) {
    throw new Error('Model name must be PascalCase (e.g., User, Post)');
  }

  if (options.count !== undefined && (options.count < 1 || options.count > 100000)) {
    throw new Error('Count must be between 1 and 100000');
  }

  // Verify seeders path exists
  const pathStat = await fs.stat(options.seedersPath).catch(() => null);

  if (pathStat === null) {
    throw new Error(`Seeders path does not exist: ${options.seedersPath}`);
  }

  if (!pathStat.isDirectory()) {
    throw new Error(`Seeders path is not a directory: ${options.seedersPath}`);
  }
}

/**
 * Generate a database seeder
 */
export async function generateSeeder(options: SeederOptions): Promise<SeederGeneratorResult> {
  try {
    await validateOptions(options);

    const seederCode = buildSeederCode(options);
    const fileName = `${options.seederName}.ts`;
    const filePath = path.join(options.seedersPath, fileName);

    FileGenerator.writeFile(filePath, seederCode, { overwrite: true });

    Logger.info(`✅ Created seeder: ${fileName}`);

    return {
      success: true,
      filePath,
      message: `Seeder '${options.seederName}' created successfully`,
    };
  } catch (error) {
    return {
      success: false,
      filePath: '',
      message: (error as Error).message,
    };
  }
}

/**
 * Build complete seeder code
 */
function buildSeederCode(options: SeederOptions): string {
  const imports = buildImports(options);
  const className = options.seederName;
  const count = options.count ?? 10;
  const truncate = options.truncate === false ? 'false' : 'true';
  const relationshipMethods = buildRelationshipMethods(options);

  return `/**
 * ${className}
 * Seeder for populating ${options.modelName} table with test data
 */

${imports}

export class ${className} {
  /**
   * Run the seeder
   * Populates the ${options.modelName.toLowerCase()} table with ${count} records
   */
  async run(): Promise<void> {
    const count = ${count};
    const factory = new ${getFactoryName(options)}();

    // Optionally truncate the table before seeding
    if (${truncate}) {
      // await Table.query().delete();
      // Or use: await database.raw('TRUNCATE TABLE ${getTableName(options.modelName)}');
    }

    // Generate and create records
    const records = factory.count(count).get();

    for (const record of records) {
      // Insert using Query Builder (recommended)
      // await ${options.modelName}.create(record);

      // Or using database adapter:
      // await database
      //   .table('${getTableName(options.modelName)}')
      //   .insert(record);
    }

    Logger.info(\`✅ Seeded \${count} ${options.modelName.toLowerCase()} records\`);
  }

  /**
   * Get records from this seeder
   */
  async getRecords(count: number): Promise<Record<string, unknown>[]> {
    const factory = new ${getFactoryName(options)}();
    return factory.count(count).get();
  }

  /**
   * Seed with specific states
   */
  async seedWithStates(): Promise<void> {
    const factory = new ${getFactoryName(options)}();

    // Create active records (50%)
    const active = factory.count(Math.ceil(${count} * 0.5)).state('active').get();
    for (const record of active) {
      // await ${options.modelName}.create(record);
    }

    // Create inactive records (30%)
    const inactive = factory.count(Math.ceil(${count} * 0.3)).state('inactive').get();
    for (const record of inactive) {
      // await ${options.modelName}.create(record);
    }

    // Create deleted records (20%)
    const deleted = factory.count(Math.ceil(${count} * 0.2)).state('deleted').get();
    for (const record of deleted) {
      // await ${options.modelName}.create(record);
    }

    Logger.info(\`✅ Seeded ${count} ${options.modelName.toLowerCase()} records with state distribution\`);
  }

  /**
   * Seed with relationships
   */
  async seedWithRelationships(): Promise<void> {
    const factory = new ${getFactoryName(options)}();

${relationshipMethods}

    Logger.info(\`✅ Seeded ${count} ${options.modelName.toLowerCase()} records with relationships\`);
  }

  /**
   * Reset seeder (truncate table)
   */
  async reset(): Promise<void> {
    // await database.raw('TRUNCATE TABLE ${getTableName(options.modelName)}');
    Logger.info(\`✅ Truncated ${getTableName(options.modelName)} table\`);
  }
}
`;
}

/**
 * Build import statements
 */
function buildImports(options: SeederOptions): string {
  const factoryName = getFactoryName(options);

  return `import { Logger } from '@config/logger';
import { ${factoryName} } from '@database/factories/${factoryName}';
import { ${options.modelName} } from '@app/Models/${options.modelName}';`;
}

/**
 * Build relationship seeding methods
 */
function buildRelationshipMethods(options: SeederOptions): string {
  if (options.relationships === undefined || options.relationships.length === 0) {
    return `    const factory = new ${getFactoryName(options)}();
    const records = factory.count(${options.count ?? 10}).get();

    // Create records with relationships (implement as needed)
    for (const record of records) {
      // await ${options.modelName}.create(record);
    }`;
  }

  const relationshipCode = options.relationships
    .map((rel) => {
      const relId = `${camelCase(rel)}Id`;

      return `    // Seed with ${rel} relationships
    const ${camelCase(rel)}s = await ${rel}.all();
    if (${camelCase(rel)}s.length > 0) {
      const factory = new ${getFactoryName(options)}();
      const records = factory
        .count(Math.min(${options.count ?? 10}, ${camelCase(rel)}s.length))
        .get();

      for (let i = 0; i < records.length; i++) {
        records[i].${relId} = ${camelCase(rel)}s[i].id;
        // await ${options.modelName}.create(records[i]);
      }
    }`;
    })
    .join('\n\n');

  return relationshipCode;
}

/**
 * Get factory name from model name
 */
function getFactoryName(options: SeederOptions): string {
  return options.factoryName ?? `${options.modelName}Factory`;
}

/**
 * Get database table name from model name
 */
function getTableName(modelName: string): string {
  // Convert PascalCase to snake_case
  return (
    modelName
      .replaceAll(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '') + 's'
  );
}

/**
 * Convert string to camelCase
 */
function camelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Get available seeder options
 */
export function getAvailableOptions(): string[] {
  return [
    'Truncate table before seeding (default: true)',
    'Custom record count (default: 10, max: 100000)',
    'Relationship seeding',
    'State-based distribution (active, inactive, deleted)',
    'Batch operations for large datasets',
  ];
}

export const SeederGenerator = {
  validateOptions,
  generateSeeder,
  getAvailableOptions,
};

export default SeederGenerator;
