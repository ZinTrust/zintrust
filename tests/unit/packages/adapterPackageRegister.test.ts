import { describe, expect, it } from 'vitest';

import { CacheDriverRegistry } from '@cache/CacheDriverRegistry';
import { MailDriverRegistry } from '@mail/MailDriverRegistry';
import { Queue } from '@tools/queue/Queue';
import { StorageDriverRegistry } from '@tools/storage/StorageDriverRegistry';

describe('adapter packages /register', () => {
  it('registers cache mongodb', async () => {
    expect(CacheDriverRegistry.has('mongodb')).toBe(false);
    await import('../../../packages/cache-mongodb/src/register.js');
    expect(CacheDriverRegistry.has('mongodb')).toBe(true);
  });

  it('registers queue redis', async () => {
    expect(() => Queue.get('redis')).toThrow();
    await import('../../../packages/queue-redis/src/register.js');
    expect(() => Queue.get('redis')).not.toThrow();
  });

  it('registers queue rabbitmq', async () => {
    expect(() => Queue.get('rabbitmq')).toThrow();
    await import('../../../packages/queue-rabbitmq/src/register.js');
    expect(() => Queue.get('rabbitmq')).not.toThrow();
  });

  it('registers queue sqs', async () => {
    expect(() => Queue.get('sqs')).toThrow();
    await import('../../../packages/queue-redis/queue-sqs/src/register.js');
    expect(() => Queue.get('sqs')).not.toThrow();
  });

  it('registers storage s3/r2/gcs', async () => {
    expect(StorageDriverRegistry.has('s3')).toBe(false);
    expect(StorageDriverRegistry.has('r2')).toBe(false);
    expect(StorageDriverRegistry.has('gcs')).toBe(false);

    await import('../../../packages/storage-s3/src/register.js');
    await import('../../../packages/storage-r2/src/register.js');
    await import('../../../packages/storage-gcs/src/register.js');

    expect(StorageDriverRegistry.has('s3')).toBe(true);
    expect(StorageDriverRegistry.has('r2')).toBe(true);
    expect(StorageDriverRegistry.has('gcs')).toBe(true);
  });

  it('registers mail smtp/sendgrid/mailgun', async () => {
    expect(MailDriverRegistry.has('smtp')).toBe(false);
    expect(MailDriverRegistry.has('sendgrid')).toBe(false);
    expect(MailDriverRegistry.has('mailgun')).toBe(false);

    await import('../../../packages/mail-smtp/src/register.js');
    await import('../../../packages/mail-sendgrid/src/register.js');
    await import('../../../packages/mail-mailgun/src/register.js');

    expect(MailDriverRegistry.has('smtp')).toBe(true);
    expect(MailDriverRegistry.has('sendgrid')).toBe(true);
    expect(MailDriverRegistry.has('mailgun')).toBe(true);
  });
});
