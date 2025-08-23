# Valyr Hub Deployment Guide
This guide covers deploying Valyr Hub to various environments including development, staging, and production.
## 📋 Prerequisites
### System Requirements
- **Node.js**: 18.x or higher
- **PostgreSQL**: 14.x or higher
- **Redis**: 6.x or higher
### External Services
- **Blockchain RPC Endpoints**:
  - Ethereum (Infura, Alchemy, or self-hosted)
  - Arbitrum RPC endpoint
  - Starknet RPC endpoint
- **IPFS Gateway** (optional, for decentralized storage)
- **Email Service** (for notifications)
- **Monitoring Service** (Datadog, New Relic, etc.)
## 🔧 Environment Configuration
### Environment Variables
Create a `.env` file with the following variables:
```bash
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
API_VERSION=v1
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/valyr"
DATABASE_POOL_SIZE=20
DATABASE_TIMEOUT=30000
# Redis
REDIS_URL="redis://localhost:6379"
REDIS_PASSWORD=""
REDIS_DB=0
REDIS_TIMEOUT=5000
# JWT Configuration
JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
JWT_EXPIRES_IN="1h"
JWT_REFRESH_EXPIRES_IN="7d"
# Blockchain Configuration
ETHEREUM_RPC_URL="https://mainnet.infura.io/v3/YOUR_PROJECT_ID"
ETHEREUM_PRIVATE_KEY="0x..."
ETHEREUM_CONTRACT_ADDRESS="0x..."
ARBITRUM_RPC_URL="https://arb1.arbitrum.io/rpc"
ARBITRUM_PRIVATE_KEY="0x..."
ARBITRUM_CONTRACT_ADDRESS="0x..."
STARKNET_RPC_URL="https://starknet-mainnet.public.blastapi.io"
STARKNET_PRIVATE_KEY="0x..."
STARKNET_CONTRACT_ADDRESS="0x..."
# External Services
IPFS_GATEWAY_URL="https://gateway.pinata.cloud"
IPFS_API_KEY="your-pinata-api-key"
IPFS_SECRET_KEY="your-pinata-secret-key"
# Webhook Configuration
WEBHOOK_SECRET="your-webhook-secret"
WEBHOOK_TIMEOUT=30000
WEBHOOK_RETRY_ATTEMPTS=3
# Rate Limiting
RATE_LIMIT_WINDOW_MS=3600000
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_SKIP_FAILED_REQUESTS=true
# Email Configuration
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
FROM_EMAIL="noreply@valyr.org"
# Monitoring
SENTRY_DSN="https://your-sentry-dsn"
DATADOG_API_KEY="your-datadog-api-key"
# Security
CORS_ORIGIN="https://valyr.org,https://app.valyr.org"
TRUST_PROXY=true
HELMET_ENABLED=true
# Feature Flags
ENABLE_REGISTRATION=true
ENABLE_VERIFICATION=true
ENABLE_BLOCKCHAIN_ANCHORING=true
ENABLE_WEBHOOKS=true
```
### Environment-Specific Configurations
#### Development
```bash
NODE_ENV=development
LOG_LEVEL=debug
DATABASE_URL="postgresql://postgres:password@localhost:5432/valyr_dev"
REDIS_URL="redis://localhost:6379/1"
CORS_ORIGIN="http://localhost:3000,http://localhost:3001"
```
#### Staging
```bash
NODE_ENV=staging
LOG_LEVEL=info
DATABASE_URL="postgresql://user:pass@staging-db:5432/valyr_staging"
REDIS_URL="redis://staging-redis:6379"
CORS_ORIGIN="https://staging.valyr.org"
```
#### Production
```bash
NODE_ENV=production
LOG_LEVEL=warn
DATABASE_URL="postgresql://user:pass@prod-db:5432/valyr"
REDIS_URL="redis://prod-redis:6379"
CORS_ORIGIN="https://valyr.org,https://app.valyr.org"
```
## 🐳 Docker Deployment
### Dockerfile
```dockerfile
# Multi-stage build for production
FROM node:18-alpine AS builder
WORKDIR /app
# Copy package files
COPY package*.json ./
COPY prisma ./prisma/
# Install dependencies
RUN npm ci --only=production && npm cache clean --force
# Copy source code
COPY . .
# Generate Prisma client
RUN npx prisma generate
# Build application
RUN npm run build
# Production stage
FROM node:18-alpine AS production
# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init
# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
WORKDIR /app
# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package*.json ./
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
USER nextjs
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node dist/health-check.js
# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
```
### Docker Compose
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/valyr
      - REDIS_URL=redis://redis:6379
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
  db:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: valyr
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
  redis:
    image: redis:6-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
    restart: unless-stopped
volumes:
  postgres_data:
  redis_data:
```
### Build and Deploy
```bash
# Build the Docker image
docker build -t valyr/hub:latest .
# Run with Docker Compose
docker-compose up -d
# Check logs
docker-compose logs -f app
# Scale the application
docker-compose up -d --scale app=3
```

## 📞 Support and Troubleshooting
### Common Issues
1. **Database Connection Issues**
   - Check DATABASE_URL format
   - Verify network connectivity
   - Check database server status
2. **Redis Connection Issues**
   - Verify REDIS_URL
   - Check Redis server status
   - Verify authentication
3. **High Memory Usage**
   - Monitor memory usage
   - Check for memory leaks
   - Optimize database queries
### Debugging
```bash
# Check application logs
docker logs valyr-hub
# Check database connections
docker exec -it postgres psql -U postgres -d valyr -c "SELECT * FROM pg_stat_activity;"
# Check Redis status
docker exec -it redis redis-cli info
# Monitor resource usage
docker stats valyr-hub
```
For additional support:
- **Documentation**: [docs.valyr.org](https://docs.valyr.org)
- **Email**: team@valyr.org
