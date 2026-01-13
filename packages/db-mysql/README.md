# @zintrust/db-mysql

MySQL / MariaDB database adapter package for Zintrust (uses `mysql2`).

## Install

Recommended:

```bash
zin add db:mysql
```

Or install directly:

```bash
npm i @zintrust/db-mysql mysql2
```

## Usage

Register the adapter at startup:

```ts
import '@zintrust/db-mysql/register';
```

Then select the adapter in your config/env (the registered driver key is `mysql`):

```env
DB_CONNECTION=mysql
```

## Docs

- https://zintrust.com/adapters
- https://zintrust.com/database-advanced

## License

This package and its dependencies are MIT licensed, permitting free commercial use.
