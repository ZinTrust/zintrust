# @zintrust/db-sqlite

SQLite database adapter package for ZinTrust (uses `better-sqlite3`).

## Install

Recommended:

```bash
zin add db:sqlite
```

Or install directly:

```bash
npm i @zintrust/db-sqlite better-sqlite3
```

## Usage

Register the adapter at startup:

```ts
import '@zintrust/db-sqlite/register';
```

Then select the adapter in your config/env (the registered driver key is `sqlite`):

```env
DB_CONNECTION=sqlite
```

## Docs

- https://zintrust.com/adapters
- https://zintrust.com/database-advanced

## License

This package and its dependencies are MIT licensed, permitting free commercial use.
