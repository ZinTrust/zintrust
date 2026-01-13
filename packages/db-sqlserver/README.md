# @zintrust/db-sqlserver

SQL Server database adapter package for Zintrust (uses `mssql`).

## Install

Recommended:

```bash
zin add db:mssql
```

Or install directly:

```bash
npm i @zintrust/db-sqlserver mssql
```

## Usage

Register the adapter at startup:

```ts
import '@zintrust/db-sqlserver/register';
```

Then select the adapter in your config/env (the registered driver key is `sqlserver`):

```env
DB_CONNECTION=sqlserver
```

## Docs

- https://zintrust.com/adapters
- https://zintrust.com/database-advanced

## License

This package and its dependencies are MIT licensed, permitting free commercial use.
