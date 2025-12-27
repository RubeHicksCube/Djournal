#!/bin/bash

# Djournal v1.0.0 - Deployment Test Script
# This script tests the deployment process and verifies everything is working

set -e

echo "🚀 Djournal v1.0.0 - Deployment Test"
echo "=================================="

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are available"

# Test build
echo "🔨 Building Docker image..."
if command -v docker-compose &> /dev/null; then
    docker-compose build
else
    docker compose build
fi

echo "✅ Docker image built successfully"

# Test startup
echo "🚀 Starting application..."
if command -v docker-compose &> /dev/null; then
    docker-compose up -d
else
    docker compose up -d
fi

# Wait for application to start
echo "⏳ Waiting for application to start..."
sleep 10

# Test health check
echo "🏥 Testing health check..."
if curl -f http://localhost:8000/api &> /dev/null; then
    echo "✅ Application is running and healthy"
else
    echo "❌ Application health check failed"
    exit 1
fi

# Test login
echo "🔐 Testing login functionality..."
TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}' \
    http://localhost:8000/api/auth/login | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    echo "✅ Login functionality working"
else
    echo "❌ Login functionality failed"
    exit 1
fi

# Test user endpoint
echo "👤 Testing user API..."
USER_DATA=$(curl -s -H "Authorization: Bearer $TOKEN" \
    http://localhost:8000/api/users/me)

if echo "$USER_DATA" | grep -q '"is_admin":true'; then
    echo "✅ Admin user functionality working"
else
    echo "❌ Admin user functionality failed"
    exit 1
fi

echo ""
echo "🎉 All tests passed! Djournal v1.0.0 is ready for deployment."
echo ""
echo "📋 Quick Start Instructions:"
echo "1. docker-compose up -d"
echo "2. Open http://localhost:8000"
echo "3. Login with: admin / admin123"
echo "4. Change default password after first login"
echo ""
echo "🔒 Security Reminder:"
echo "- Change ADMIN_PASSWORD in .env"
echo "- Update JWT_SECRET in .env"
echo "- Use HTTPS in production"
echo ""

# Cleanup
echo "🧹 Cleaning up test environment..."
if command -v docker-compose &> /dev/null; then
    docker-compose down
else
    docker compose down
fi

echo "✅ Deployment test completed successfully!"