#!/bin/sh

# Zintrust Docker Entrypoint Script
# Handles initialization and startup of the application

set -e

echo "Starting Zintrust application..."
echo "Environment: $NODE_ENV"
echo "Database: $DB_CONNECTION"

# Wait for database to be ready (if using external database)
if [ -n "$DB_HOST" ] && [ "$DB_HOST" != "localhost" ]; then
  echo "Waiting for database to be ready at $DB_HOST:$DB_PORT..."

  # Retry up to 30 times with 1 second delay
  for i in $(seq 1 30); do
    if nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
      echo "✓ Database is ready"
      break
    fi

    if [ $i -eq 30 ]; then
      echo "✗ Database connection failed after 30 seconds"
      exit 1
    fi

    echo "Attempt $i/30: Database not ready, waiting..."
    sleep 1
  done
fi

# Run database migrations if script exists
if [ -f "/app/scripts/migrate.sh" ]; then
  echo "Running database migrations..."
  chmod +x /app/scripts/migrate.sh
  /app/scripts/migrate.sh
fi

# Start the application
echo "Starting server on $HOST:$PORT"
exec node dist/bootstrap.js
