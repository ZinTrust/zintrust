import { ErrorFactory } from '@exceptions/ZintrustError';
import { InMemoryDriver } from '@broadcast/drivers/InMemory';

export const Broadcast = Object.freeze({
  async send(channel: string, event: string, data: unknown) {
    const driver = (process.env['BROADCAST_DRIVER'] ?? 'inmemory').trim().toLowerCase();

    if (driver === 'inmemory') {
      const result = await InMemoryDriver.send(undefined as unknown, channel, event, data);
      return result;
    }

    const err = ErrorFactory.createConfigError(`Broadcast driver not implemented: ${driver}`);
    throw err;
  },
});

export default Broadcast;
