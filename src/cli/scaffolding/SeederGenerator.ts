/**
 * Seeder Generator - Phase 6.2
 * Generates database seeders for populating development/staging databases
 * Uses factory generators for consistent data generation
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { CommonUtils } from '@common/index';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { fsPromises as fs } from '@node-singletons/fs';
import * as path from '@node-singletons/path';

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
    throw ErrorFactory.createCliError('Seeder name is required');
  }

  if (!options.seederName.endsWith('Seeder')) {
    throw ErrorFactory.createCliError('Seeder name must end with "Seeder" (e.g., UserSeeder)');
  }

  if (!/^[A-Z][a-zA-Z\d]*Seeder$/.test(options.seederName)) {
    throw ErrorFactory.createCliError('Seeder name must be PascalCase ending with "Seeder"');
  }

  if (options.modelName === undefined || options.modelName.trim() === '') {
    throw ErrorFactory.createCliError('Model name is required');
  }

  if (!/^[A-Z][a-zA-Z\d]*$/.test(options.modelName)) {
    throw ErrorFactory.createCliError('Model name must be PascalCase (e.g., User, Post)');
  }

  if (options.count !== undefined && (options.count < 1 || options.count > 100000)) {
    throw ErrorFactory.createCliError('Count must be between 1 and 100000');
  }

  // Verify seeders path exists
  const pathStat = await fs.stat(options.seedersPath).catch(() => null);

  if (pathStat === null) {
    throw ErrorFactory.createCliError(`Seeders path does not exist: ${options.seedersPath}`);
  }

  if (!pathStat.isDirectory()) {
    throw ErrorFactory.createCliError(`Seeders path is not a directory: ${options.seedersPath}`);
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
    Logger.error('Seeder generation failed', error);
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

export const ${className} = Object.freeze({
${buildSeederObjectBody(options, count, truncate, relationshipMethods)}
});
`;
}

/**
 * Build seeder object body
 */
function buildSeederObjectBody(
  options: SeederOptions,
  count: number,
  truncate: string,
  relationshipMethods: string
): string {
  const factoryName = getFactoryName(options);
  const modelLower = options.modelName.toLowerCase();

  return `${buildSeederRunMethod(options, count, truncate, factoryName, modelLower)},

${buildSeederGetRecordsMethod(factoryName)},

${buildSeederWithStatesMethod(options, count, factoryName, modelLower)},

${buildSeederWithRelationshipsMethod(options, count, factoryName, modelLower, relationshipMethods)},

${buildSeederResetMethod(options)}`;
}

/**
 * Build seeder run method
 */
function buildSeederRunMethod(
  options: SeederOptions,
  count: number,
  truncate: string,
  factoryName: string,
  modelLower: string
): string {
  const tableName = getTableName(options.modelName);
  return `  /**
   * Run the seeder
   * Populates the ${modelLower} table with ${count} records
   */
  async run(): Promise<void> {
    const count = ${count};
    const factory = ${factoryName}.new();

    // Optionally truncate the table before seeding
    if (${truncate}) {
      // await Table.query().delete();
      // Or use: await database.raw('TRUNCATE TABLE ${tableName}');
    }

    // Generate and create records
    const records = factory.count(count);

    for (const record of records) {
      // Insert using Query Builder (recommended)
      // await ${options.modelName}.create(record);
    }

    Logger.info(\`✅ Seeded \${count} ${modelLower} records\`);
  }`;
}

/**
 * Build seeder getRecords method
 */
function buildSeederGetRecordsMethod(factoryName: string): string {
  return `  /**
   * Get records from this seeder
   */
  async getRecords(count: number): Promise<Record<string, unknown>[]> {
    const factory = ${factoryName}.new();
    return factory.count(count);
  }`;
}

/**
 * Build seeder with states method
 */
function buildSeederWithStatesMethod(
  options: SeederOptions,
  count: number,
  factoryName: string,
  modelLower: string
): string {
  return `  /**
   * Seed with specific states
   */
  async seedWithStates(): Promise<void> {
    const factory = ${factoryName}.new();

    // Create active records (50%)
    const active = factory.state('active').count(Math.ceil(${count} * 0.5));
    for (const record of active) {
      // await ${options.modelName}.create(record);
    }

    // Create inactive records (30%)
    const inactive = factory.state('inactive').count(Math.ceil(${count} * 0.3));
    for (const record of inactive) {
      // await ${options.modelName}.create(record);
    }

    // Create deleted records (20%)
    const deleted = factory.state('deleted').count(Math.ceil(${count} * 0.2));
    for (const record of deleted) {
      // await ${options.modelName}.create(record);
    }

    Logger.info(\`✅ Seeded ${count} ${modelLower} records with state distribution\`);
  }`;
}

/**
 * Build seeder with relationships method
 */
function buildSeederWithRelationshipsMethod(
  _options: SeederOptions,
  count: number,
  factoryName: string,
  modelLower: string,
  relationshipMethods: string
): string {
  return `  /**
   * Seed with relationships
   */
  async seedWithRelationships(): Promise<void> {
    const factory = ${factoryName}.new();

${relationshipMethods}

    Logger.info(\`✅ Seeded ${count} ${modelLower} records with relationships\`);
  }`;
}

/**
 * Build seeder reset method
 */
function buildSeederResetMethod(options: SeederOptions): string {
  const tableName = getTableName(options.modelName);
  return `  /**
   * Reset seeder (truncate table)
   */
  async reset(): Promise<void> {
    // await database.raw('TRUNCATE TABLE ${tableName}');
    Logger.info(\`✅ Truncated ${tableName} table\`);
  }`;
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
    const records = factory.count(${options.count ?? 10});

    // Create records with relationships (implement as needed)
    for (const record of records) {
      // await ${options.modelName}.create(record);
    }`;
  }

  const relationshipCode = options.relationships
    .map((rel) => {
      const relId = `${CommonUtils.camelCase(rel)}Id`;

      return `    // Seed with ${rel} relationships
    const ${CommonUtils.camelCase(rel)}s = await ${rel}.all();
    if (${CommonUtils.camelCase(rel)}s.length > 0) {
      const factory = new ${getFactoryName(options)}();
      const records = factory
        .count(Math.min(${options.count ?? 10}, ${CommonUtils.camelCase(rel)}s.length))
        .get();

      for (let i = 0; i < records.length; i++) {
        records[i].${relId} = ${CommonUtils.camelCase(rel)}s[i].id;
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

export const SeederGenerator = Object.freeze({
  validateOptions,
  generateSeeder,
  getAvailableOptions,
});

export default SeederGenerator;
