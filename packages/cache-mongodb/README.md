# @zintrust/cache-mongodb

MongoDB (Atlas Data API) cache driver for Zintrust.

- Docs: https://zintrust.com/cache

## Install

```bash
npm i @zintrust/cache-mongodb
```

## Usage

Side-effect register (recommended):

```ts
import '@zintrust/cache-mongodb/register';
```

Then set `CACHE_DRIVER=mongodb` and configure:

- `MONGO_URI` (Atlas Data API base URL)
- `MONGO_DB`

## License

This package and its dependencies are MIT licensed, permitting free commercial use.
