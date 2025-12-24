# Microservices Docker Integration

Zintrust automatically generates Docker configuration for your microservices to simplify development and deployment.

## Generated Files

When you generate a microservice domain using the CLI, Zintrust creates the following Docker-related files:

1.  **`services/{domain}/{service}/Dockerfile`**: A production-ready Dockerfile for the individual service.
2.  **`services/{domain}/docker-compose.yml`**: A Docker Compose file to run all services in the domain together, including infrastructure like PostgreSQL and Redis.

## Docker Compose Configuration

The generated `docker-compose.yml` includes pre-configured environment variables for each service:

```yaml
user-service:
  build:
    context: ../../
    dockerfile: services/ecommerce/user-service/Dockerfile
  ports:
    - '3001:3000'
  environment:
    NODE_ENV: development
    MICROSERVICES: 'true'
    SERVICE_NAME: user-service
    SERVICE_PORT: 3000
    # Database Configuration
    DB_CONNECTION: postgresql
    DB_HOST: postgres
    DB_PORT: 5432
    DB_DATABASE: zintrust_user-service
    DB_USERNAME: zintrust
    DB_PASSWORD: zintrust
    # Cache Configuration
    REDIS_HOST: redis
    REDIS_PORT: 6379
```

### Customizing Environment Variables

You can easily add or modify environment variables in the `docker-compose.yml` file. This is useful for:

- Changing database credentials.
- Adding API keys for external services.
- Configuring service-specific settings.

## Running with Docker Compose

To start all services in a domain:

```bash
cd services/{domain}
docker-compose up -d
```

This will:

1. Build the Docker images for each service.
2. Start PostgreSQL and Redis containers.
3. Start each microservice container, linked to the database and cache.

## Production Deployment

For production, you can use the `zintrust docker` command to build and push images to a registry:

```bash
# Build and push images
npm run microservices:docker <domain> <services>
```

This uses the `ServiceBundler` to create highly optimized images (typically < 1MB for the application logic) suitable for serverless or containerized environments.
