# Cloud Deployment

Zintrust is designed to run seamlessly on various cloud platforms, from serverless environments to traditional VPS.

## Cloudflare Workers

Zintrust can be deployed to Cloudflare Workers using the `wrangler` CLI.

```bash
npm run deploy:cloudflare
```

Ensure you have configured your `wrangler.toml` with the necessary KV namespaces for secrets management.

## AWS Lambda

Deploy Zintrust as a serverless function on AWS Lambda using the `LambdaAdapter`.

```typescript
import { LambdaAdapter } from '@adapters/LambdaAdapter';
import { app } from './app';

export const handler = LambdaAdapter.create(app);
```

## Vercel / Netlify

For frontend-heavy applications or documentation sites, Zintrust integrates perfectly with Vercel and Netlify.

## DigitalOcean / Linode / AWS EC2

For traditional VPS deployments, follow the standard [Deployment Guide](./deployment.md) using PM2 and Nginx.

## Secrets Management

Zintrust's `SecretsManager` provides a unified interface for retrieving secrets from various cloud providers:

- **Cloudflare KV**
- **AWS Secrets Manager**
- **Environment Variables** (Fallback)
