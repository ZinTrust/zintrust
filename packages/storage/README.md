# @zintrust/storage

Core storage (disk driver) abstraction for ZinTrust with multipart form parsing support.

- Docs: https://zintrust.com/storage

## Install

```bash
npm i @zintrust/storage
```

## Usage

Register storage drivers at startup:

```ts
import '@zintrust/storage/register';
```

Then configure storage disks and use `Storage` to interact with drivers.

## License

This package and its dependencies are MIT licensed, permitting free commercial use.
