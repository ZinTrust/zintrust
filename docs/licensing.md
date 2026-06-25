---
title: Licensing
description: ZinTrust framework and package licenses, including commercial licensing for @zintrust/redis-rpc
---

# Licensing

ZinTrust publishes the core framework and most optional packages under the **MIT License**. One package — `@zintrust/redis-rpc` — uses a **dual license** (Apache 2.0 for qualifying community use, or a paid Commercial License).

Full MIT text: [LICENSE.md](https://github.com/ZinTrust/ZinTrust/blob/release/LICENSE.md)

## Framework

| Package | License | Notes |
| --- | --- | --- |
| [`@zintrust/core`](https://www.npmjs.com/package/@zintrust/core) | MIT | Main ZinTrust framework. Permissive open-source license for commercial and non-commercial use. |

## Optional packages (`packages/`)

All packages below are published under the **MIT License** unless noted. MIT applies to the ZinTrust package code itself. Some adapters depend on third-party SDKs with their own licenses (called out in the **Notes** column).

### Cache

| Package | License | Docs | Notes |
| --- | --- | --- | --- |
| [`@zintrust/cache-mongodb`](https://www.npmjs.com/package/@zintrust/cache-mongodb) | MIT | [MongoDB Cache](/package-cache-mongodb) | Package and dependencies are MIT licensed. |
| [`@zintrust/cache-redis`](https://www.npmjs.com/package/@zintrust/cache-redis) | MIT | [Redis Cache](/package-cache-redis) | Package and dependencies are MIT licensed. |

### Database

| Package | License | Docs | Notes |
| --- | --- | --- | --- |
| [`@zintrust/db-d1`](https://www.npmjs.com/package/@zintrust/db-d1) | MIT | [Cloudflare D1](/package-db-d1) | Package and dependencies are MIT licensed. |
| [`@zintrust/db-mysql`](https://www.npmjs.com/package/@zintrust/db-mysql) | MIT | [MySQL](/package-db-mysql) | Package and dependencies are MIT licensed. |
| [`@zintrust/db-postgres`](https://www.npmjs.com/package/@zintrust/db-postgres) | MIT | [PostgreSQL](/package-db-postgres) | Package and dependencies are MIT licensed. |
| [`@zintrust/db-sqlite`](https://www.npmjs.com/package/@zintrust/db-sqlite) | MIT | [SQLite](/package-db-sqlite) | Package and dependencies are MIT licensed. |
| [`@zintrust/db-sqlserver`](https://www.npmjs.com/package/@zintrust/db-sqlserver) | MIT | [SQL Server](/package-db-sqlserver) | Package and dependencies are MIT licensed. |
| [`@zintrust/client-rds-data`](https://www.npmjs.com/package/@zintrust/client-rds-data) | MIT | [RDS Data Client](/package-client-rds-data) | AWS RDS Data API helpers. |

### Mail

| Package | License | Docs | Notes |
| --- | --- | --- | --- |
| [`@zintrust/mail-mailgun`](https://www.npmjs.com/package/@zintrust/mail-mailgun) | MIT | [Mailgun](/package-mail-mailgun) | Package and dependencies are MIT licensed. |
| [`@zintrust/mail-nodemailer`](https://www.npmjs.com/package/@zintrust/mail-nodemailer) | MIT | [Nodemailer](/package-mail-nodemailer) | Package and dependencies are MIT licensed. |
| [`@zintrust/mail-sendgrid`](https://www.npmjs.com/package/@zintrust/mail-sendgrid) | MIT | [SendGrid](/package-mail-sendgrid) | Package and dependencies are MIT licensed. |
| [`@zintrust/mail-smtp`](https://www.npmjs.com/package/@zintrust/mail-smtp) | MIT | [SMTP](/package-mail-smtp) | Package and dependencies are MIT licensed. |

### Queue

| Package | License | Docs | Notes |
| --- | --- | --- | --- |
| [`@zintrust/queue-cloudflare`](https://www.npmjs.com/package/@zintrust/queue-cloudflare) | MIT | [Cloudflare Queues](/package-queue-cloudflare) | Cloudflare Queues driver. |
| [`@zintrust/queue-monitor`](https://www.npmjs.com/package/@zintrust/queue-monitor) | MIT | [Queue Monitor](/package-queue-monitor) | Package and dependencies are MIT licensed. |
| [`@zintrust/queue-rabbitmq`](https://www.npmjs.com/package/@zintrust/queue-rabbitmq) | MIT | [RabbitMQ](/package-queue-rabbitmq) | Depends on `amqplib` (MIT). |
| [`@zintrust/queue-redis`](https://www.npmjs.com/package/@zintrust/queue-redis) | MIT | [Redis Queue](/package-queue-redis) | Package and dependencies are MIT licensed. |
| [`@zintrust/queue-sqs`](https://www.npmjs.com/package/@zintrust/queue-sqs) | MIT | [SQS](/package-queue-sqs) | Depends on the AWS SDK (Apache 2.0). |
| [`@zintrust/redis-rpc`](https://www.npmjs.com/package/@zintrust/redis-rpc) | **Apache 2.0 or Commercial** | [Redis RPC](/package-redis-rpc) | **Dual-licensed.** See [Redis RPC licensing](#redis-rpc-licensing) below. |

### Storage

| Package | License | Docs | Notes |
| --- | --- | --- | --- |
| [`@zintrust/storage`](https://www.npmjs.com/package/@zintrust/storage) | MIT | [Storage Core](/package-storage) | Storage abstraction and upload utilities. |
| [`@zintrust/storage-gcs`](https://www.npmjs.com/package/@zintrust/storage-gcs) | MIT | [Google Cloud Storage](/package-storage-gcs) | Depends on Google Cloud Storage client (Apache 2.0). |
| [`@zintrust/storage-r2`](https://www.npmjs.com/package/@zintrust/storage-r2) | MIT | [Cloudflare R2](/package-storage-r2) | Depends on the AWS SDK (Apache 2.0). |
| [`@zintrust/storage-s3`](https://www.npmjs.com/package/@zintrust/storage-s3) | MIT | [Amazon S3](/package-storage-s3) | Package and dependencies are MIT licensed. |

### Cloudflare proxies

| Package | License | Docs | Notes |
| --- | --- | --- | --- |
| [`@zintrust/cloudflare-containers-proxy`](https://www.npmjs.com/package/@zintrust/cloudflare-containers-proxy) | MIT | [Containers Proxy](/package-cloudflare-containers-proxy) | Cloudflare Containers gateway. |
| [`@zintrust/cloudflare-d1-proxy`](https://www.npmjs.com/package/@zintrust/cloudflare-d1-proxy) | MIT | [D1 Proxy](/package-cloudflare-d1-proxy) | Package and dependencies are MIT licensed. |
| [`@zintrust/cloudflare-email-proxy`](https://www.npmjs.com/package/@zintrust/cloudflare-email-proxy) | MIT | — | Package and dependencies are MIT licensed. |
| [`@zintrust/cloudflare-kv-proxy`](https://www.npmjs.com/package/@zintrust/cloudflare-kv-proxy) | MIT | [KV Proxy](/package-cloudflare-kv-proxy) | Package and dependencies are MIT licensed. |

### Runtime, tooling, and utilities

| Package | License | Docs | Notes |
| --- | --- | --- | --- |
| [`@zintrust/d1-migrator`](https://www.npmjs.com/package/@zintrust/d1-migrator) | MIT | [D1 Migrator](/package-d1-migrator) | Resumable D1 migration toolkit. |
| [`@zintrust/expose`](https://www.npmjs.com/package/@zintrust/expose) | MIT | [Expose](/package-expose) | Local tunnel exposure for development. |
| [`@zintrust/governance`](https://www.npmjs.com/package/@zintrust/governance) | MIT | [Governance](/package-governance) | ESLint and governance tooling. |
| [`@zintrust/signer`](https://www.npmjs.com/package/@zintrust/signer) | MIT | [Signer](/package-signer) | Request signing and verification. |
| [`@zintrust/socket`](https://www.npmjs.com/package/@zintrust/socket) | MIT | [Socket](/package-socket) | Unified WebSocket runtime. |
| [`@zintrust/trace`](https://www.npmjs.com/package/@zintrust/trace) | MIT | [Trace](/package-trace) | Request, query, and job tracing. |
| [`@zintrust/workers`](https://www.npmjs.com/package/@zintrust/workers) | MIT | [Workers](/package-workers) | Background job orchestration. |

## Redis RPC licensing

`@zintrust/redis-rpc` is the only ZinTrust package with a distinct license model. You may use it under **one** of the following:

### Option 1: Apache License 2.0 (Community Use)

Apache 2.0 applies when your use qualifies as **Community Use**:

- Personal, educational, or evaluation use
- Non-production environments (local development, CI, automated testing, staging)
- Open-source projects released under an OSI-approved open-source license
- Commercial organizations with **fewer than 100 full-time employees** and **less than US$1,000,000** in annual gross revenue

Full text: [LICENSE-APACHE-2.0](https://github.com/ZinTrust/ZinTrust/blob/release/packages/redis-rpc/LICENSE-APACHE-2.0) · License chooser: [LICENSE](https://github.com/ZinTrust/ZinTrust/blob/release/packages/redis-rpc/LICENSE)

### Option 2: ZinTrust Commercial License

You need a Commercial License if any of the following apply:

- Production use in a for-profit product or service when your organization does **not** qualify for Community Use
- You need contractual warranties, indemnification, or an SLA beyond the Apache 2.0 disclaimer
- You want OEM, white-label, or redistribution rights beyond Apache redistribution
- You want to use ZinTrust trademarks in product marketing beyond attribution

Commercial terms are defined in a separate written order or enterprise agreement. See [COMMERCIAL-LICENSE.md](https://github.com/ZinTrust/ZinTrust/blob/release/packages/redis-rpc/COMMERCIAL-LICENSE.md) for the overview.

### Request a Commercial License

Contact ZinTrust to request a Commercial License for `@zintrust/redis-rpc` or enterprise terms:

- **Web:** [https://zintrust.com/licensing](https://zintrust.com/licensing)
- **Repository:** [github.com/ZinTrust/ZinTrust](https://github.com/ZinTrust/ZinTrust/issues) (for open-source and community-use questions)

## Contributor License Agreement

Contributions to the ZinTrust repository are subject to the [Contributor License Agreement (CLA)](/contributing#contributor-license-agreement-cla) described in the Contributing guide.

## Third-party dependencies

MIT-licensed ZinTrust packages may bundle or depend on libraries with other permissive licenses (for example Apache 2.0 for AWS or Google Cloud SDKs). Those licenses govern the third-party code only. Your obligations for third-party components are defined by each dependency's license, not by ZinTrust's MIT license for the adapter package itself.