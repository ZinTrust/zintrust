# Database Migrations

This guide collects the ZinTrust migration workflow in one place.

If you are looking for the CLI command to add a column to an existing table, use:

```bash
zin add migration [column] [model]
```

Example:

```bash
zin add migration bio user
```

Shorthand:

```bash
zin am bio user
```

This generates a timestamped migration file under `database/migrations/` with a logical name like `add_bio_users_table`.

## `zin s` vs migration commands

`zin s` starts the application in development mode. It does not create or run migrations.

Migration-related commands are separate:

```bash
zin create migration [model]
zin add migration [column] [model]
zin migrate
```

## Migration Generator Commands

### Create a table migration

Use this when the table does not exist yet:

```bash
zin create migration user
```

Shorthand:

```bash
zin cm user
```

This generates a migration named like `create_users_table`.

### Add a column migration

Use this when the table already has a create migration:

```bash
zin add migration bio user
```

Shorthand:

```bash
zin am bio user
```

This generates a migration named like `add_bio_users_table`.

Important:

- ZinTrust expects the model's create-table migration to exist first.
- If it cannot find a matching `create_<models>_table` migration, it will stop and tell you to create it first.

### Custom migration names

For advanced cases, you can generate a migration with a custom logical name:

```bash
zin add migration create_users_table
zin add migration backfill_user_flags
```

Use the custom form when the opinionated add-column naming does not fit the change you need.

## Typical Workflow

### 1. Create the table migration

```bash
zin cm user
```

### 2. Add follow-up column migrations as needed

```bash
zin am bio user
zin am avatar_url user
zin am status user
```

### 3. Edit the generated file

Generated migrations are only scaffolds. You still need to fill in the schema logic inside `up()` and `down()`.

Example:

```ts
import { Blueprint, type IDatabase, MigrationSchema } from '@zintrust/core';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.table('users', (table: Blueprint) => {
      table.string('bio').nullable();
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.table('users', (table: Blueprint) => {
      table.dropColumn('bio');
    });
  },
};
```

## Running Migrations

Run pending migrations:

```bash
zin migrate
```

Useful variants:

```bash
zin migrate --status
zin migrate --rollback
zin migrate --rollback --step 2
zin migrate --fresh
zin migrate --reset
```

## Cloudflare D1

If your project uses Cloudflare D1, use the D1-aware migration mode:

```bash
zin migrate --local --database zintrust_db
```

Or remote:

```bash
zin migrate --remote --database zintrust_db
```

## Where Migration Files Live

By default, ZinTrust reads migrations from:

```txt
database/migrations
```

That default comes from the database config migration directory.

## Troubleshooting

### "Usage: zin add migration [column] [model]"

You passed the add-column form with missing arguments. Use both the column name and the model name:

```bash
zin add migration bio user
```

### "Missing required create migration for model"

Create the table migration first:

```bash
zin create migration user
```

### I expected `zin s` to handle migrations

`zin s` only starts the app. Migration generation and execution are separate CLI commands.

## Related Docs

- [CLI Guide](./cli-guide.md)
- [CLI Reference](./cli-reference.md)
- [Database Configuration](./config-database.md)
- [Your First API](./first-api.md)
