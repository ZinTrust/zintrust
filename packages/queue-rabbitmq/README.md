# @zintrust/queue-rabbitmq

RabbitMQ queue driver registration for Zintrust.

- Docs: https://zintrust.com/queue

## Install

```bash
npm i @zintrust/queue-rabbitmq
```

## Usage

```ts
import '@zintrust/queue-rabbitmq/register';
```

Then set `QUEUE_DRIVER=rabbitmq` and configure:

- `RABBITMQ_URL` (e.g. `amqp://localhost`)

## License

This package depends on amqplib which is MIT licensed. MIT is a permissive license that allows free commercial use without requiring you to open-source your code.
