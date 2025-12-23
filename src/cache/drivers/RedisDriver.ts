/**
 * Redis Cache Driver
 * Zero-dependency implementation using Node.js native net module
 */

import { CacheDriver } from '@cache/CacheDriver';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import * as net from 'node:net';

/**
 * Create a new Redis driver instance
 */
const create = (): CacheDriver => {
  let client: net.Socket | null = null;
  const host = Env.REDIS_HOST;
  const port = Env.REDIS_PORT;

  const connect = async (): Promise<net.Socket> => {
    if (client && !client.destroyed) return client;

    return new Promise((resolve, reject) => {
      const socket = net.connect(port, host, () => {
        client = socket;
        resolve(socket);
      });

      socket.on('error', (err) => {
        Logger.error(`Redis Connection Error: ${err.message}`);
        reject(err);
      });
    });
  };

  const sendCommand = async (command: string): Promise<string> => {
    const socket = await connect();
    return new Promise((resolve, _reject) => {
      socket.once('data', (data) => {
        resolve(data.toString());
      });
      socket.write(command);
    });
  };

  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const response = await sendCommand(`GET ${key}\r\n`);
        if (response.startsWith('$-1')) return null;

        // Basic RESP parsing
        const lines = response.split('\r\n');
        const value = lines[1];
        return JSON.parse(value) as T;
      } catch (error) {
        Logger.error('Redis GET failed', error);
        return null;
      }
    },

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      const jsonValue = JSON.stringify(value);
      let command = `SET ${key} ${jsonValue}\r\n`;
      if (ttl !== undefined) {
        command = `SETEX ${key} ${ttl} ${jsonValue}\r\n`;
      }
      await sendCommand(command);
    },

    async delete(key: string): Promise<void> {
      await sendCommand(`DEL ${key}\r\n`);
    },

    async clear(): Promise<void> {
      await sendCommand(`FLUSHDB\r\n`);
    },

    async has(key: string): Promise<boolean> {
      const response = await sendCommand(`EXISTS ${key}\r\n`);
      return response.includes(':1');
    },
  };
};

/**
 * RedisDriver namespace - sealed for immutability
 */
export const RedisDriver = Object.freeze({
  create,
});
