# @zintrust/cloudflare-email-proxy

Cloudflare Worker service that exposes a small HTTPS API for Cloudflare Email Routing sends.

Docs: https://zintrust.com/mail

This is intended for server-to-server use when a ZinTrust app runs outside Cloudflare Workers but still wants to use the built-in `MAIL_DRIVER=cl` or `MAIL_DRIVER=cloudflare` path.

## Endpoint

All requests are `POST` and require signed request headers.

- `/zin/mail/cloudflare/send` → `{ binding?, message }` → `{ ok: true, messageId? }`

## Required bindings

- `SEND_EMAIL` send_email binding

If your binding name is not `SEND_EMAIL`, set Worker var `MAIL_CLOUDFLARE_BINDING` or pass `binding` in the signed payload.

Optional but recommended:

- `ZT_NONCES` KV binding for replay protection

## Required secrets / vars

Secret:

- `MAIL_CLOUDFLARE_PROXY_SECRET` shared signing secret used to verify requests
- `APP_KEY` fallback shared signing secret if `MAIL_CLOUDFLARE_PROXY_SECRET` is not set

Optional vars:

- `ZT_PROXY_SIGNING_WINDOW_MS` default `60000`
- `ZT_MAX_BODY_BYTES` default `131072`

## Deploy

From this package directory:

```bash
wrangler deploy
```

Set secrets:

```bash
wrangler secret put MAIL_CLOUDFLARE_PROXY_SECRET
```

## Use from ZinTrust

Configure your app:

- `MAIL_DRIVER=cl`
- `MAIL_CLOUDFLARE_PROXY_URL=https://<your-worker-host>`
- `MAIL_CLOUDFLARE_PROXY_KEY_ID=k1`
- `MAIL_CLOUDFLARE_PROXY_SECRET=super-secret-shared-key`
- `MAIL_CLOUDFLARE_BINDING=SEND_EMAIL` if needed

Then use `Mail.send(...)` as normal.

## License

This package and its dependencies are MIT licensed, permitting free commercial use.
