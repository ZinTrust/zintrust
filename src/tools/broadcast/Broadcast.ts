import { InMemoryDriver } from '@broadcast/drivers/InMemory';
import { PusherDriver } from '@broadcast/drivers/Pusher';
import { RedisDriver } from '@broadcast/drivers/Redis';
import { RedisHttpsDriver } from '@broadcast/drivers/RedisHttps';
import broadcastConfig from '@config/broadcast';
import { ErrorFactory } from '@exceptions/ZintrustError';

export const Broadcast = Object.freeze({
  async send(channel: string, event: string, data: unknown) {
    const driver = broadcastConfig.getDriverName();
    const config = broadcastConfig.getDriverConfig();

    if (driver === 'inmemory') {
      const result = await InMemoryDriver.send(undefined as unknown, channel, event, data);
      return result;
    }

    if (driver === 'pusher') {
      if (config.driver !== 'pusher') {
        throw ErrorFactory.createConfigError('Broadcast driver config mismatch: expected pusher');
      }
      return PusherDriver.send(config, channel, event, data);
    }

    if (driver === 'redis') {
      if (config.driver !== 'redis') {
        throw ErrorFactory.createConfigError('Broadcast driver config mismatch: expected redis');
      }
      return RedisDriver.send(config, channel, event, data);
    }

    if (driver === 'redishttps') {
      if (config.driver !== 'redishttps') {
        throw ErrorFactory.createConfigError(
          'Broadcast driver config mismatch: expected redishttps'
        );
      }
      return RedisHttpsDriver.send(config, channel, event, data);
    }

    const err = ErrorFactory.createConfigError(`Broadcast driver not implemented: ${driver}`);
    throw err;
  },
});

export default Broadcast;
