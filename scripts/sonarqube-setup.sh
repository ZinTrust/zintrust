#!/bin/bash

# SonarQube Quick Setup Script
# This script helps set up SonarQube for Zintrust

set -e

echo "🔍 Zintrust SonarQube Setup"
echo "================================"
echo ""

# Check if sonar-scanner is installed
if ! command -v sonar-scanner &> /dev/null; then
    echo "❌ sonar-scanner not found"
    echo "Install with: npm install -g sonarqube-scanner"
    exit 1
fi

echo "✅ sonar-scanner is installed"
echo ""

# Choose setup option
echo "Select SonarQube setup option:"
echo "1) Local Server (Docker)"
echo "2) SonarQube Cloud"
echo "3) Configure Existing Server"
echo ""
read -p "Enter choice (1-3): " choice

case $choice in
    1)
        echo ""
        echo "📦 Starting SonarQube with Docker..."
        echo ""

        # Check if Docker is installed
        if ! command -v docker &> /dev/null; then
            echo "❌ Docker not found. Please install Docker first."
            exit 1
        fi

        # Check if container already exists
        if docker ps -a --format '{{.Names}}' | grep -q '^sonarqube$'; then
            echo "SonarQube container exists. Starting..."
            docker start sonarqube
        else
            echo "Creating SonarQube container..."
            docker run -d --name sonarqube \
                -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLED=true \
                -p 9000:9000 \
                sonarqube:latest
        fi

        echo ""
        echo "⏳ Waiting for SonarQube to start (30-60 seconds)..."
        sleep 10

        # Wait for server to be ready
        max_attempts=12
        attempt=0
        while [ $attempt -lt $max_attempts ]; do
            if curl -s http://localhost:9000/api/system/status | grep -q '"status":"UP"'; then
                echo "✅ SonarQube is ready!"
                break
            fi
            echo "  Attempt $((attempt + 1))/$max_attempts..."
            sleep 5
            ((attempt++))
        done

        if [ $attempt -eq $max_attempts ]; then
            echo "⚠️  SonarQube may still be starting. Check http://localhost:9000"
        fi

        echo ""
        echo "📝 Next steps:"
        echo "1. Open http://localhost:9000"
        echo "2. Login with admin/admin"
        echo "3. Create a new project (Key: 'zintrust')"
        echo "4. Generate a token"
        echo "5. Run: export SONAR_TOKEN=your_token_here"
        echo "6. Run: yarn test:sonar"
        ;;

    2)
        echo ""
        echo "☁️  SonarQube Cloud Setup"
        echo ""
        echo "Steps:"
        echo "1. Go to https://sonarcloud.io/"
        echo "2. Sign up with GitHub"
        echo "3. Import this repository"
        echo "4. Generate a token in Account → Security"
        echo ""
        read -p "Enter your SonarQube Cloud token: " sonar_token

        if [ -z "$sonar_token" ]; then
            echo "❌ Token is required"
            exit 1
        fi

        export SONAR_TOKEN="$sonar_token"
        export SONAR_HOST_URL="https://sonarcloud.io"

        echo ""
        echo "✅ SonarQube Cloud configured"
        echo "Run: yarn test:sonar"
        ;;

    3)
        echo ""
        read -p "Enter SonarQube URL (e.g., http://localhost:9000): " sonar_url
        read -p "Enter SonarQube token: " sonar_token

        if [ -z "$sonar_url" ] || [ -z "$sonar_token" ]; then
            echo "❌ URL and token are required"
            exit 1
        fi

        export SONAR_HOST_URL="$sonar_url"
        export SONAR_TOKEN="$sonar_token"

        echo ""
        echo "✅ SonarQube configured"
        echo "Run: yarn test:sonar"
        ;;

    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "================================"
echo "Setup Complete! ✨"
echo ""
echo "To run analysis:"
echo "  yarn test:sonar"
echo ""
echo "To view results:"
echo "  http://localhost:9000/dashboard?id=zintrust (Local)"
echo "  https://sonarcloud.io/project/overview?id=zintrust (Cloud)"
echo ""
