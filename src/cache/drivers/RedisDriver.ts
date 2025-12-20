/**
 * Redis Cache Driver
 * Zero-dependency implementation using Node.js native net module
 */

import { CacheDriver } from '@cache/CacheDriver';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import * as net from 'node:net';

export class RedisDriver implements CacheDriver {
  private client: net.Socket | null = null;
  private readonly host: string;
  private readonly port: number;

  constructor() {
    this.host = Env.REDIS_HOST;
    this.port = Env.REDIS_PORT;
  }

  private async connect(): Promise<net.Socket> {
    if (this.client && !this.client.destroyed) return this.client;

    return new Promise((resolve, reject) => {
      const socket = net.connect(this.port, this.host, () => {
        this.client = socket;
        resolve(socket);
      });

      socket.on('error', (err) => {
        Logger.error(`Redis Connection Error: ${err.message}`);
        reject(err);
      });
    });
  }

  private async sendCommand(command: string): Promise<string> {
    const socket = await this.connect();
    return new Promise((resolve, _reject) => {
      socket.once('data', (data) => {
        resolve(data.toString());
      });
      socket.write(command);
    });
  }

  public async get<T>(key: string): Promise<T | null> {
    try {
      const response = await this.sendCommand(`GET ${key}\r\n`);
      if (response.startsWith('$-1')) return null;

      // Basic RESP parsing
      const lines = response.split('\r\n');
      const value = lines[1];
      return JSON.parse(value) as T;
    } catch (error) {
      Logger.error('Redis GET failed', error);
      return null;
    }
  }

  public async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const jsonValue = JSON.stringify(value);
    let command = `SET ${key} ${jsonValue}\r\n`;
    if (ttl !== undefined) {
      command = `SETEX ${key} ${ttl} ${jsonValue}\r\n`;
    }
    await this.sendCommand(command);
  }

  public async delete(key: string): Promise<void> {
    await this.sendCommand(`DEL ${key}\r\n`);
  }

  public async clear(): Promise<void> {
    await this.sendCommand(`FLUSHDB\r\n`);
  }

  public async has(key: string): Promise<boolean> {
    const response = await this.sendCommand(`EXISTS ${key}\r\n`);
    return response.includes(':1');
  }
}
