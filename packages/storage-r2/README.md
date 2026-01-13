# @zintrust/storage-r2

Cloudflare R2 storage driver registration for Zintrust.

- Docs: https://zintrust.com/storage

## Install

```bash
npm i @zintrust/storage-r2
```

## Usage

```ts
import '@zintrust/storage-r2/register';
```

Configure your disk driver as `r2` and provide the R2 endpoint + credentials.

## License

This package depends on the AWS SDK which is licensed under Apache 2.0. AWS SDKs are permissive licenses that allow commercial use without requiring you to open-source your code. See [AWS SDK License](https://github.com/aws/aws-sdk-js-v3/blob/main/LICENSE) for details.
