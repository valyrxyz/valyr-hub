#!/bin/sh
set -e

echo "🚀 Starting OpenvApps Hub..."

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
until npx prisma db push --accept-data-loss 2>/dev/null; do
  echo "Database not ready, waiting 2 seconds..."
  sleep 2
done

echo "✅ Database is ready!"

# Generate Prisma client
echo "🔄 Generating Prisma client..."
npx prisma generate

# Run database migrations/sync
echo "🔄 Running database migrations..."
npx prisma db push --accept-data-loss

echo "🎉 Starting the application..."

# Execute the CMD from Dockerfile
exec "$@" 