import { callZedgi } from './client.js';
import type { ZedgiClientOptions, RedisClient } from './types.js';

export const createRedisClient = (options: ZedgiClientOptions): RedisClient => {
  const call = <T>(method: string, payload: Record<string, unknown> = {}): Promise<T> =>
    callZedgi<T>(options, 'redis', method, payload);

  return Object.freeze({
    ping: () => call<string>('ping'),
    get: (key) => call<string | null>('get', { args: [key] }),
    set: (key, value, ...args) => call<'OK' | null>('set', { args: [key, value, ...args] }),
    del: (...keys) => call<number>('del', { args: keys }),
    exists: (...keys) => call<number>('exists', { args: keys }),
    expire: (key, seconds) => call<number>('expire', { args: [key, seconds] }),
    ttl: (key) => call<number>('ttl', { args: [key] }),
    incr: (key) => call<number>('incr', { args: [key] }),
    decr: (key) => call<number>('decr', { args: [key] }),
    incrby: (key, increment) => call<number>('incrby', { args: [key, increment] }),
    decrby: (key, decrement) => call<number>('decrby', { args: [key, decrement] }),
    hget: (key, field) => call<string | null>('hget', { args: [key, field] }),
    hset: (key, ...fieldValues) => call<number>('hset', { args: [key, ...fieldValues] }),
    hgetall: (key) => call<Record<string, string> | null>('hgetall', { args: [key] }),
    hdel: (key, ...fields) => call<number>('hdel', { args: [key, ...fields] }),
    lpush: (key, ...values) => call<number>('lpush', { args: [key, ...values] }),
    rpush: (key, ...values) => call<number>('rpush', { args: [key, ...values] }),
    lpop: (key) => call<string | null>('lpop', { args: [key] }),
    rpop: (key) => call<string | null>('rpop', { args: [key] }),
    lrange: (key, start, stop) => call<string[]>('lrange', { args: [key, start, stop] }),
    sadd: (key, ...members) => call<number>('sadd', { args: [key, ...members] }),
    srem: (key, ...members) => call<number>('srem', { args: [key, ...members] }),
    smembers: (key) => call<string[]>('smembers', { args: [key] }),
    sismember: (key, member) => call<number>('sismember', { args: [key, member] }),
    zadd: (key, score, member) => call<number>('zadd', { args: [key, score, member] }),
    zrange: (key, start, stop) => call<string[]>('zrange', { args: [key, start, stop] }),
    zscore: (key, member) => call<string | null>('zscore', { args: [key, member] }),
    call: (command, ...args) => call<unknown>('call', { command, args }),
    pipeline: (commands) => call<unknown[]>('pipeline', { commands }),
    multi: (commands) => call<unknown[]>('multi', { commands }),
  });
};
