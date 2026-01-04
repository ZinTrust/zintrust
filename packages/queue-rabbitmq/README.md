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
