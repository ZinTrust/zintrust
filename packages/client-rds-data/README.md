# @zintrust/client-rds-data

AWS RDS Data API and Secrets Manager helpers for ZinTrust.

Docs: https://zintrust.com/package-client-rds-data

## Install

```bash
npm i @zintrust/client-rds-data @aws-sdk/client-rds-data @aws-sdk/client-secrets-manager
```

## Usage

```ts
import RdsData from '@zintrust/client-rds-data';

const rds = await RdsData.getRdsDataClient('us-east-1');
const secrets = await RdsData.getSecretsManagerClient('us-east-1');

await rds.executeStatement({
  resourceArn: process.env.AWS_RDS_RESOURCE_ARN,
  secretArn: process.env.AWS_RDS_SECRET_ARN,
  database: 'app',
  sql: 'select 1',
});

const secret = await secrets.getSecretValue('my/service/secret');
```

## What it provides

- Lazy ESM loading for AWS SDK RDS Data API support
- Lazy ESM loading for AWS Secrets Manager support
- ZinTrust-native configuration and error handling

## License

MIT
