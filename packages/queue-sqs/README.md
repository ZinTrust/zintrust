# @zintrust/queue-sqs

AWS SQS queue driver registration for Zintrust.

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
