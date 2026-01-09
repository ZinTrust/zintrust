# Database Seeding

Database seeding allows you to populate your database with test or initial data. This is useful for development, testing, and setting up initial application state (like admin users or lookup tables).

## Usage

### Run Seeders

To run your database seeders, use the `db:seed` command:

```bash
# Run all seeders
zin db:seed

# Reset database (truncate) before seeding
zin db:seed --reset
```

### Seeder Discovery

By default, the CLI looks for seeders in:

1. `database/seeders/*.ts` (Global seeders)
2. `src/services/*/*/database/seeders/*.ts` (Service-local seeders)

### The DatabaseSeeder Pattern

If a file named `DatabaseSeeder.ts` exists in a seeder directory, the CLI **only runs that file**. It assumes `DatabaseSeeder` acts as an orchestrator that calls other seeders.

If `DatabaseSeeder.ts` is NOT present, the CLI will find and run **all** seeder files in that directory alphabetically.

## Creating Seeders

Use the `add` command to generate a new seeder:

```bash
# Create a simple seeder
zin add seeder UserSeeder --model User --count 50

# Create the master orchestrator
zin add seeder DatabaseSeeder
```

### Writing a Seeder

A seeder is a module that exports a `run` method:

```typescript
import { UserFactory } from '@database/factories/UserFactory';

export const UserSeeder = Object.freeze({
  async run(): Promise<void> {
    // Generate 50 users using a factory
    await UserFactory.new().count(50).create();
  },
});
```

### Writing a DatabaseSeeder

The master seeder typically delegates to other seeders:

```typescript
import { Database } from '@runtime/Database';
import { SeederDiscovery } from '@cli/discovery/SeederDiscovery';
import { SeederLoader } from '@cli/loader/SeederLoader';

export const DatabaseSeeder = Object.freeze({
  async run(): Promise<void> {
    // 1. Run specific seeders in order
    await SeederLoader.load(dir + '/PermissionSeeder.ts').run();
    await SeederLoader.load(dir + '/RoleSeeder.ts').run();

    // 2. Or discover and run all others
    const files = SeederDiscovery.listSeederFiles(dir).filter((f) => !f.includes('DatabaseSeeder'));

    for (const file of files) {
      await SeederLoader.load(file).run();
    }
  },
});
```

## Microservices Support

Zintrust supports service-oriented seeding.

```bash
# Run global seeders AND all microservice seeders
zin db:seed

# Run seeders for a specific service AND global seeders
zin db:seed --service users

# Run ONLY seeders for a specific service (skip global)
zin db:seed --only-service users
```

To enable seeding for a microservice, place seeders in: `src/services/<domain>/<service>/database/seeders/`.
