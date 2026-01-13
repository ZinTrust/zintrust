# @zintrust/db-postgres

PostgreSQL database adapter package for Zintrust (uses `pg`).

## Install

Recommended:

```bash
zin add db:postgres
```

Or install directly:

```bash
npm i @zintrust/db-postgres pg
```

## Usage

Register the adapter at startup:

```ts
import '@zintrust/db-postgres/register';
```

Then select the adapter in your config/env (the registered driver key is `postgresql`):

```env
DB_CONNECTION=postgresql
```

## Docs

- https://zintrust.com/adapters
- https://zintrust.com/database-advanced

## License

This package and its dependencies are MIT licensed, permitting free commercial use.
