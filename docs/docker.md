# Docker Deployment

Zintrust comes with a pre-configured `Dockerfile` and `docker-compose.yml` for easy containerization.

## Building the Image

Build your application's Docker image:

```bash
docker build -t zintrust-app .
```

## Using Docker Compose

The included `docker-compose.yml` sets up the application along with a database:

```bash
docker-compose up -d
```

## Multi-Stage Builds

The default `Dockerfile` uses a multi-stage build to keep the final image size small:

1. **Build Stage**: Installs all dependencies and compiles TypeScript.
2. **Production Stage**: Copies only the compiled code and production dependencies.

## Environment Variables in Docker

You can pass environment variables to your container using an `.env` file or the `-e` flag:

```bash
docker run -e DB_HOST=db.example.com zintrust-app
```

## Persistent Storage

Ensure you mount volumes for your logs and any local file storage:

```yaml
services:
  app:
    volumes:
      - ./logs:/app/logs
      - ./storage:/app/storage
```
