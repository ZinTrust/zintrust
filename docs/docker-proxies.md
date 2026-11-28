# Docker Proxies

The proxy stack uses:

- Monolith runtime image: `zintrust/zintrust` (runs `zin proxy:*` commands)
- Companion gateway image: `zintrust/zintrust-proxy-gateway`

## Quick start

```bash
docker compose -f docker/docker-compose.proxy.yml up -d
```

## Pin a version

```bash
ZINTRUST_IMAGE=zintrust/zintrust:<version> \
PROXY_GATEWAY_IMAGE=zintrust/zintrust-proxy-gateway:<version> \
docker compose -f docker/docker-compose.proxy.yml up -d
```

## Publishing images (maintainers)

```bash
zin docker push --tag <version>
```

Common options:

- `--platforms linux/amd64,linux/arm64`
- `--no-also-latest`
- `--only runtime|gateway|both`
