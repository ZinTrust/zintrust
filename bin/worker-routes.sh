#!/bin/bash

# Startup script for Workers API and Queue Monitor
# Usage: ./bin/worker-routes.sh

# Load environment variables if present
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | awk '/=/ {print $1}')
fi

echo "Starting Workers API (Port 7772)..."
docker-compose -f docker-compose.workers-routes.yml up --build
