# Microservices Docker

ZinTrust includes a separate microservices workspace workflow under `services/`.

This page documents how Docker fits into that workflow.

Important: this is distinct from `zin add service` (which scaffolds services inside a single project). The microservices scripts generate a **domain folder** like `services/ecommerce/*`.

## What gets generated

When you generate a microservices domain, ZinTrust creates:

- `services/<domain>/<service>/...` (one folder per service)
- `services/<domain>/docker-compose.yml` (local dev compose for the domain)

Generate a domain:

```bash
npm run microservices:generate -- ecommerce users,orders,payments --port 3001
```

Notes:

- `<services>` is a comma-separated list
- `--port` sets the base port (defaults to `3001`); services increment from there

## Local development with Docker Compose

Run all services in a domain (plus shared infra declared in the compose file):

```bash
cd services/ecommerce
docker-compose up -d
```

To see logs:

```bash
docker-compose logs -f
```

You can customize `services/<domain>/docker-compose.yml` like any other compose setup:

- service environment variables
- port mappings
- database credentials / hostnames
- adding optional dependencies (Redis, queues, etc.)

## Generating per-service Dockerfiles

The microservices CLI has a `docker` command that generates a minimal `Dockerfile` per service directory.

```bash
npm run microservices:docker -- ecommerce users,orders --registry localhost:5000
```

What it does (current behavior):

- writes `services/<domain>/<service>/Dockerfile`
- prints a `docker build ...` command you can run
- does not automatically push images

After generating Dockerfiles, you can build images using compose:

```bash
docker-compose -f services/ecommerce/docker-compose.yml build
```

## Bundling for deployment

If you want a lightweight deployable artifact per service, use the bundler:

```bash
npm run microservices:bundle -- ecommerce users,orders --output dist/services --target-size 1
```

This creates independent bundles under `dist/services/<domain>-<service>/` and reports size/optimization status.
