# Broadcasting

Zintrust includes a broadcasting toolkit for publishing events via pluggable drivers.

## Core API

The main entrypoint is `Broadcast.send(channel, event, data)`.

Example:

    	import { Broadcast } from '@broadcast/Broadcast';

    	await Broadcast.send('notifications', 'user.created', {
    		id: 'user_123',
    		email: 'hello@example.com',
    	});

The driver used is selected by `BROADCAST_DRIVER`.

## Drivers

### In-memory (default)

Best for local development and tests.

    BROADCAST_DRIVER=inmemory

### Pusher

Uses Pusher’s REST API.

    BROADCAST_DRIVER=pusher
    PUSHER_APP_ID=...
    PUSHER_APP_KEY=...
    PUSHER_APP_SECRET=...
    PUSHER_APP_CLUSTER=mt1
    PUSHER_USE_TLS=true

### Redis

Publishes a JSON payload to a Redis Pub/Sub channel.

    BROADCAST_DRIVER=redis
    BROADCAST_REDIS_HOST=localhost
    BROADCAST_REDIS_PORT=6379
    BROADCAST_REDIS_PASSWORD=
    BROADCAST_CHANNEL_PREFIX=broadcast:

The channel name published to Redis is:

    ${BROADCAST_CHANNEL_PREFIX}${channel}

Message format:

    { "event": "user.created", "data": { "id": "user_123" } }

### Redis (HTTPS)

Publishes via an HTTP endpoint that accepts Redis commands (useful when you can’t reach Redis over TCP).

    BROADCAST_DRIVER=redishttps
    REDIS_HTTPS_ENDPOINT=https://...
    REDIS_HTTPS_TOKEN=...
    REDIS_HTTPS_TIMEOUT=5000
    BROADCAST_CHANNEL_PREFIX=broadcast:

## Where to look in the codebase

- Toolkit: `src/tools/broadcast/Broadcast.ts`
- Config/env mapping: `src/config/broadcast.ts`
- Drivers: `src/tools/broadcast/drivers/`
