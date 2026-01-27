# @zintrust/queue-sqs

AWS SQS queue driver registration for ZinTrust.

- Docs: https://zintrust.com/queue

## Install

```bash
npm i @zintrust/queue-sqs
```

## Usage

```ts
import '@zintrust/queue-sqs/register';
```

Then set `QUEUE_DRIVER=sqs` and configure:

- `AWS_REGION`
- `SQS_QUEUE_URL` (or pass queue URL explicitly in your app config)

## License

This package depends on the AWS SDK which is licensed under Apache 2.0. AWS SDKs are permissive licenses that allow commercial use without requiring you to open-source your code. See [AWS SDK License](https://github.com/aws/aws-sdk-js-v3/blob/main/LICENSE) for details.
